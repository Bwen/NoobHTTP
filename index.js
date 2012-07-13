"use strict";

var fs = require('fs'),
  path = require('path'),
  jsdom = require('jsdom'),
  mime = require('mime'),
  mkdirp = require('mkdirp'),
  url = require('url'),
  Cookies = require('cookies'),
  QueryString = require('querystring'),
  Class = require('./Class').Class,
  Server = Class.extend(new (require('eventemitter2').EventEmitter2)({
    wildcard: true,
    delimiter: '/'
  })).extend({
  init: function init(options) {
    var self = this;
    this.regex = /{noobhttp-([a-zA-Z0-9]+)(.*?)}/gi;

    options = (options === undefined ? {} : options);

    this.nodeVersion = process.version.replace(/[^0-9\.]/, '');
    if (options.hasOwnProperty('serverInfo')) {
      this.serverInfo = options.serverInfo;
    } else {
      this.version = JSON.parse(fs.readFileSync(__dirname + "/package.json")).version;
      this.serverInfo = 'NoobHTTP/' + this.version;
    }

    this.errorTexts = {
      403: "Forbidden",
      404: "File Not Found",
      405: "Method Not Allowed",
      500: "Internal Error",
      501: "Not Implemented"
    };

    this.sharedFiles = require('./sharedFiles');

    this.port = (options.hasOwnProperty('ssl') ? 443 : 80);
    if (options.hasOwnProperty('port')) {
      this.port = options.port;
    }

    this.parsableExtensions = ['.html'];
    if (options.hasOwnProperty('parsableExtensions')) {
      this.parsableExtensions = options.parsableExtensions;
    }

    this.availableLanguages = ['en'];
    if (options.hasOwnProperty('availableLanguages')) {
      this.availableLanguages = options.availableLanguages;
    }

    this.cache = {
      dir: '/tmp/noobhttp/cache',
      days: 2
    };

    if (options.hasOwnProperty('cache')) {
      if (options.cache.hasOwnProperty('dir')) {
        this.cache.dir = options.cache.dir;
      }

      if (options.cache.hasOwnProperty('days')) {
        this.cache.days = options.cache.days;
      }
    }

    this.home = './public';
    if (options.hasOwnProperty('home')) {
      this.home = options.home;
    }
    this.home = fs.realpathSync(this.home);

    function emitReq(req, res) {
      var requestData = '';
      req.on('data', function (data) {
        requestData += data;
      });

      req.on('end', function () {
        self.emitRequest(req, res, requestData);
      });
    }

    if (options.hasOwnProperty('http_server')) {
      this.http_server = options.http_server;
      this.port = options.http_server.address().port;
      return;
    }

    this.ssl = (options.hasOwnProperty('ssl') ? true : false);
    if (this.ssl) {
      if (options.ssl.hasOwnProperty('key') && options.ssl.hasOwnProperty('cert')) {
        this.http_server = require('https').createServer({
          key: options.ssl.key,
          cert: options.ssl.cert
        }, emitReq);
      } else {
        throw new Error('NoobHTTP.Server: Error missing ssl properties key or cert');
      }
    } else {
      this.http_server = require('http').createServer(emitReq);
    }

    this.http_server.listen(this.port);
  },
  emitRequest: function emitRequest(req, res, data) {
    req.url = url.parse(req.url, true);

    // always include the port even if its not in the host to be consistent
    if (req.headers.host.indexOf(':') == -1) {
      req.headers.host += ':' + this.port;
    }

    // make sur the url always ends with a slash for event string sake
    if (!req.url.pathname.match(/\/$/) && path.extname(req.url.pathname) == '') {
      req.url.pathname += '/';
    }

    var eventString = req.headers.host + '/' + req.method + req.url.pathname;
    req.noobhttp = {
      homedir: this.home,
      eventString: eventString,
      data: data,
      cookies: new Cookies(req, res),
      auth: {
        realm: 'Noob Realm',
        request: false,
        authorized: false
      },
      error: {},
      response: {}
    };
    req.noobhttp.language = this.getRequestLanguage(req);

    res.setHeader('server', this.serverInfo);

    this.emit('request/' + eventString, req);
    this.processRequest(req, res);
  },
  emitError: function emitError(code, req, res) {
    req.noobhttp.error =  {
      headers: {'content-type': 'text/plain'},
      data: this.errorTexts[code]
    };

    this.emit("error/" + req.headers.host + '/' + code, code, req);

    res.setHeader('content-length', Buffer.byteLength(req.noobhttp.error.data));
    res.writeHead(code, req.noobhttp.error.headers);
    res.end(req.noobhttp.error.data);
  },
  emitResponse: function emitResponse(file, data, req, res) {
    req.noobhttp.response = {
      file: file,
      data: data
    };

    this.emit('response/' + req.noobhttp.eventString, req);

    if (this.parsableExtensions.indexOf(path.extname(req.noobhttp.response.file)) != -1) {
      this.parseFile(res, req, function (parsedFile) {
        res.writeHead(200, {'content-type': mime.lookup(req.noobhttp.response.file)});
        res.end(parsedFile);
      });

      return;
    }

    res.writeHead(200, {'content-type': mime.lookup(req.noobhttp.response.file)});
    res.end(req.noobhttp.response.data);
  },
  basicAuth: function basicAuth(req, res) {
    res.writeHead(401, {
        'Content-Type': 'text/plain',
        'WWW-Authenticate': 'Basic realm="' + req.noobhttp.auth.realm + '"'
    });
    res.end('Authentication required');
  },
  processRequest: function processRequest(req, res) {
    var file = path.normalize(req.noobhttp.homedir + req.url.pathname), self = this;

    res.setHeader('x-generated-by', 'a noob... xD');
    res.setHeader('x-powered-by', 'Node.js/' + this.nodeVersion);
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('x-xss-protection', '1; mode=block');

    // TODO: implement with the possibility of the user setting the options. prop in req.noobhttp.response.headers loop? move to emitRequest
    //res.setHeader('x-ua-compatible',  'IE=edge,chrome=1');
    //res.setHeader('x-frame-options', '');
    //res.setHeader('x-content-security-policy', '');
    //res.setHeader('x-webkit-csp', '');

    if (this.sharedFiles.hasOwnProperty(path.basename(file))) {
      file = __dirname + '/' + this.sharedFiles[ path.basename(file) ];
    }

    if (file.match(/\/\./)) {
      this.emitError(403, req, res);
      return;
    }

    if (!fs.existsSync(file)) {
      this.emitError(404, req, res);
      return;
    }

    if (['TRACE', 'CONNECT'].indexOf(req.method) !== -1) {
      this.emitError(501, req, res);
      return;
    }

    var stats = fs.lstatSync(file);
    if (stats.isDirectory()) {
      if (!file.match(/\/$/i)) {
        file += "/";
      }

      var acceptedMethods = [];
      ['POST', 'GET', 'DELETE', 'PUT'].forEach(function (method) {
        if (fs.existsSync(file + '.' + method.toLowerCase() + '.js')) {
          acceptedMethods.push(method);
        }
      });

      if (req.method == 'OPTIONS') {
        res.writeHead(200, {
          'content-length': 0,
          'allow': 'OPTIONS' + (acceptedMethods.length > 0 ? ', ' + acceptedMethods.join(', ') : '')
        });

        res.end();
        return;
      }

      if (acceptedMethods.indexOf(req.method) !== -1) {
        // if there is a request for no cache we clear the require cache for this module
        if (req.headers.hasOwnProperty('cache-control') && req.headers['cache-control'] == 'no-cache') {
          var name = require.resolve(file + '.' + req.method.toLowerCase() + '.js');
          delete require.cache[name];
        }

        try {
          var handler = require(file + '.' + req.method.toLowerCase() + '.js');
          if (typeof handler == 'function') {
            handler(req, res, setTimeout(function () {
              self.emitError(500, req, res);
            }, 2000));
          }
        } catch (Error){
          // FIXME: what if the setTimeout has gone off and the module crashes...
          self.emitError(500, req, res);
        }

        return;
      }

      file += "index.html";
      if (!fs.existsSync(file)) {
        this.emitError(405, req, res);
        return;
      }

      stats = fs.lstatSync(file);
    } else if (req.method == 'OPTIONS') {
      res.writeHead(200, {
        'content-length': 0,
        'allow': 'OPTIONS, GET'
      });
      res.end();
      return;
    }

    if (["GET", "HEAD"].indexOf(req.method) == -1) {
      this.emitError(405, req, res);
      return;
    }

    if (req.noobhttp.auth.request) {
      if (!req.headers.hasOwnProperty('authorization')) {
        this.basicAuth(req, res);
        return;
      }

      var auth = new Buffer(((req.headers.authorization || '').split(/\s+/).pop() || ''), 'base64').toString();
      this.emit('auth/' + req.noobhttp.eventString, req, auth.split(/:/)[0], auth.split(/:/)[1]);

      if (!req.noobhttp.auth.authorized) {
        this.basicAuth(req, res);
        return;
      }
    }

    var cachedFilename = this.cache.dir + "/" + req.headers.host + "/" + req.noobhttp.language + file.replace(req.noobhttp.homedir, '');
    if (!fs.existsSync(cachedFilename)
      || (req.headers.hasOwnProperty('cache-control') && req.headers['cache-control'] == 'no-cache')) {
      cachedFilename = null;
    } else {
      stats = fs.lstatSync(cachedFilename);
    }

    var etag = '"' + stats.ino + '-' + stats.size + '-' + Date.parse(stats.mtime) + '"',
      expireDate = new Date(stats.mtime);
    expireDate.setUTCDate(stats.mtime.getUTCDate() + this.cache.days);
    res.setHeader('last-modified', stats.mtime.toUTCString());
    res.setHeader('etag', etag);
    res.setHeader('expires', expireDate.toUTCString());
    res.setHeader('cache-control', 'public, must-revalidate');
    res.setHeader('accept-ranges', 'bytes');
    res.setHeader('content-length', stats.size);

    if (req.headers.hasOwnProperty('if-modified-since')) {
      var since = Date.parse(req.headers['if-modified-since']);
      if (since >= Date.parse(stats.mtime)) {
        res.writeHead(304, {});
        res.end();
        return;
      }
    }

    if (req.headers.hasOwnProperty('if-none-match') && req.headers['if-none-match'] == etag) {
      res.writeHead(304, {});
      res.end();
      return;
    }

    if (req.method == 'HEAD') {
      res.writeHead(200, {'content-type': mime.lookup(file)});
      res.end();
      return;
    }

    // if its larger than a MegaByte we response in streaming
    if ((stats.size / (1024*1024)).toFixed(2) > 1) {
      this.streamResponse(file, stats, req, res);
      return;
    }

    if (cachedFilename) {
      fs.readFile(cachedFilename, function (err, data) {
        if (err) {
          self.emitError(500, req, res);
          return;
        }
        self.emitResponse(file, data, req, res);
      });

      return;
    }

    fs.readFile(file, function (err, data) {
      if (err) {
        self.emitError(500, req, res);
        return;
      }
      self.emitResponse(file, data, req, res);
    });
  },
  streamResponse: function streamResponse(filename, stats, req, res) {
    var start = 0, end = stats.size - 1, onemegabyte = (1024*1024);

    if (req.headers.hasOwnProperty('range')) {
      var matches = req.headers.range.match(/bytes=([0-9]+)\-([0-9]+|)/);
      start = parseInt(matches[1], 10);
      end = (matches[2] != '' ? parseInt(matches[2], 10) : onemegabyte);

      // if we have a "if-range" header we match it to the etag to make sure it has not changed
      if (req.headers.hasOwnProperty('if-range') && res.getHeader('etag') != req.headers['if-range']) {
        start = 0;
        end = onemegabyte;
      }

      if (start > end) {
        return;
      }
    }

    res.writeHead(206, {
      'accept-ranges': 'bytes',
      'content-range': 'bytes ' + start + '-' + end + '/' + stats.size,
      'content-length': end - start + 1,
      'content-type': mime.lookup(filename),
      'content-disposition': 'inline; filename=' + path.basename(filename) + ';',
      'transfer-encoding': 'chunked',
      'connection': 'keep-alive'
    });

    if (start > 0 && mime.lookup(filename) === "video/x-flv") {
      res.write("FLV" + pack("CCNN", 1, 5, 9, 9));
    }

    fs.createReadStream(filename, {flags: "r", start: start, end: end}).pipe(res);
  },
  getRequestLanguage: function getRequestLanguage(req) {
    var language = 'en', self = this;

    if (this.availableLanguages.indexOf(req.noobhttp.cookies.get("noobhttp-lang")) != -1) {
      req.noobhttp.language = req.noobhttp.cookies.get("noobhttp-lang");
    } else {
      // -- check request header accept-language for potential languages
      if (req.headers.hasOwnProperty('accept-language')) {
        var acceptableLanguages = req.headers['accept-language'].split(/[,;]/);
        acceptableLanguages.forEach(function (language) {
          if (!req.hasOwnProperty('language') && self.availableLanguages.indexOf(language.substring(0, 2)) != -1) {
            req.noobhttp.language = language.substring(0, 2);
          }
        });
      }
    }

    return language;
  },
  crawlRequestPath: function crawlRequestPath(homedir, currentPath) {
    var i = 0, name, paths = {
      i18n: [],
      templates: []
    }, homePath = homedir.replace(/\/[^/]+$/, '');

    currentPath = (path.extname(currentPath) !== '' ? currentPath.replace(/\/[^/]+$/, '') : currentPath.replace(/\/$/, ''));

    while (homePath != currentPath && i < 10) {
      for (name in paths) {
        if (paths.hasOwnProperty(name) && fs.existsSync(currentPath + '/.' + name)) {
          paths[name].push(currentPath + '/.' + name);
        }
      }
      currentPath = currentPath.replace(/\/[^/]+$/, '');
      i += 1;
    }

    return paths;
  },
  parseFile: function parseFile(res, req, callback) {
    var file_content = req.noobhttp.response.data.toString(),
    cachedFilename = "/" + req.headers.host + "/" + req.noobhttp.language + req.noobhttp.response.file.replace(req.noobhttp.homedir, '');

    if (!file_content.match(this.regex)) {
      callback(req.noobhttp.response.data);
      return;
    }

    // TODO: i18n tags
    // TODO: plug events

    var expireDate = new Date();
    expireDate.setUTCDate(expireDate.getUTCDate() + this.cache.days);
    res.setHeader('last-modified', new Date());
    res.setHeader('expires', expireDate.toUTCString());

    var paths = this.crawlRequestPath(req.noobhttp.homedir, req.noobhttp.response.file),
    file_options = this.parseOptions(file_content);
    file_content = this.cleanContent(file_content, file_options);

    if (file_options.hasOwnProperty('include')) {
      if (Object.prototype.toString.apply(file_options.include) === '[object Array]') {
        file_options.include.forEach(function (include) {
          file_content = file_content.replace(include.match[0], this.includeFile(paths, include.file));
        });
      }
      else {
        file_content = file_content.replace(file_options.include.match[0], this.includeFile(paths, file_options.include.file));
      }
    }

    if (file_options.hasOwnProperty('layout')) {
      var layout = this.includeFile(paths, 'layout.html'),
      layout_options = this.parseOptions(layout);

      // if we found a layout process it
      if (layout) {

        if (layout_options.hasOwnProperty('content')) {
          layout = layout.replace(layout_options.content.match[0], file_content);
        }

        // clean layout after processing all the markers/options
        layout = this.cleanContent(layout, layout_options);

        // update the length of the answer
        res.setHeader('content-length', Buffer.byteLength(layout));

        this.cacheFile(cachedFilename, layout);
        callback(layout);
        return;
      }
    }

    // update the length of the answer
    res.setHeader('content-length', Buffer.byteLength(file_content));
    this.cacheFile(cachedFilename, file_content);
    callback(file_content);
  },
  cacheFile: function cacheFile (filename, content) {
    var self = this;
    (function (filename, content) {
      process.nextTick(function() {
        filename = self.cache.dir + filename;
        mkdirp(path.dirname(filename), function (err) {
          if (err) {
            console.error(err);
            return;
          }

          fs.writeFile(filename, content);
        });
      });
    })(filename, content);
  },
  includeFile: function includeFile (paths, filename) {
    var nearestFile = null, self = this;

    // Find the nearest
    paths.templates.forEach(function (template) {
      var layout_path = template + "/" + filename;
      if (nearestFile == null && fs.existsSync(layout_path)) {
        nearestFile = fs.readFileSync(layout_path).toString();
      }
    });

    if (!nearestFile) {
      return '';
    }

    var options = this.parseOptions(nearestFile);

    if (options.hasOwnProperty('include')) {
      if (Object.prototype.toString.apply(options.include) === '[object Array]') {
        options.include.forEach(function (include) {
          nearestFile = nearestFile.replace(include.match[0], self.includeFile(paths, include.file));
        });
      }
      else {
        nearestFile = nearestFile.replace(options.include.match[0], this.includeFile(paths, options.include.file));
      }
    }

    if (filename === 'layout.html') {
      return nearestFile;
    }

    return this.cleanContent(nearestFile, options);
  },
  cleanContent: function cleanContent(content, options) {
    var contentMarkers = ['include'], key;

    for (key in options) {
      // we need to keep some keys since they are markers for content
      if (options.hasOwnProperty(key) && contentMarkers.indexOf(key) === -1) {
        content = content.replace(options[key].match[0], '');
      }
    }
    return content;
  },
  parseOptions: function parseOptions(content) {
    var match = null, options = {};
    while (match = this.regex.exec(content)) {
      var opts = QueryString.parse(match[2].replace(/^\s+|\s+$/g, "")), key;
      for (key in opts) {
        if (opts.hasOwnProperty(key)) {
          var value = opts[key];
          if (value.match(/^\d+$/)) {
            opts[key] = parseFloat(value);
          }
          else if (value.match(/^true$/i)) {
            opts[key] = true;
          }
          else if (value.match(/^false$/i)) {
            opts[key] = false;
          }
          else if (value.match(/^null$/i)) {
            opts[key] = null;
          }
          else if (!value) {
            opts[key] = undefined;
          }
          else {
            opts[key] = value.toString();
          }
        }
      }

      if (!options.hasOwnProperty(match[1])) {
        options[match[1]] = opts;
        delete match.input;
        options[match[1]].match = match;
      }
      else if (Object.prototype.toString.apply(options[match[1]]) !== '[object Array]') {
        var existing = options[match[1]], option = opts;
        options[match[1]] = [];
        options[match[1]].push(existing);
        delete match.input;
        option.match = match;
        options[match[1]].push(option);
      }
      else if (Object.prototype.toString.apply(options[match[1]]) === '[object Array]') {
        delete match.input;
        opts.match = match;
        options[match[1]].push(opts);
      }
    }

    return options;
  }
});

module.exports.Server = Server;

