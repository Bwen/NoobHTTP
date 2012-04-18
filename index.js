var fs = require('fs')
  , path = require('path')
  , util = require('util')
  , mime = require('mime')
  , Config = require('NoobConfig')
;


function NoobHTTP (config) {
    var self = this
      , now = new Date()
      , date = now.getFullYear()+'.'
          +(now.getMonth() < 10 ? '0'+now.getMonth() : now.getMonth())+'.'
          +(now.getDate() < 10 ? '0'+now.getDate() : now.getDate())
    this.logFile = fs.createWriteStream(Config('NoobHTTP').path.logs + config.name +'.'+ date +'.log', {'flags': 'a'});
    
    this.forbiddenRegex = Config('NoobHTTP').filename.forbiddenRegex;
    this.propertyFilename = Config('NoobHTTP').filename.property;
    this.auth = config.auth;
    this.name = config.name;
    this.path = fs.realpathSync(config.path);
    this.isSSL = config.isSSL;
    if (config.isSSL) {
        this.http_server = require('https').createServer({
            key: fs.readFileSync(Config('NoobHTTP').path.ssl+'privatekey.pem'),
            cert: fs.readFileSync(Config('NoobHTTP').path.ssl+'certificate.pem')
        }, function (req, res) {
            self.processRequest.call(self, req, res);
        });
    }
    else {
        this.http_server = require('http').createServer(function (req, res) {
            self.processRequest.call(self, req, res);
        });
    }

    this.http_server.listen(config.port);
};
util.inherits(NoobHTTP, require('events').EventEmitter);

NoobHTTP.prototype.response = function response(filename, res, log) {
    var self = this;

    fs.readFile(filename, function (err, data) {
        if (err) {
            log.error = err;
            log.code = 500;
            self.logFile.write(JSON.stringify(log)+"\n");
            res.writeHead(500, {'Content-Type': 'text/plain'});
            res.end('Internal Error');
            return;
        }

        log.code = 200;
        self.logFile.write(JSON.stringify(log)+"\n");
        res.writeHead(200, {'Content-Type': mime.lookup(filename)});
        res.end(data);
    });
};

NoobHTTP.prototype.requestBasicAuth = function requestBasicAuth(realm, res, log) {
    log.code = 401;
    this.logFile.write(JSON.stringify(log)+"\n");
    res.writeHead(401, {
        'Content-Type': 'text/plain',
        'WWW-Authenticate': 'Basic realm="'+realm+'"'
    });
    res.end('Authentication required');
};

NoobHTTP.prototype.getPathProperties = function findBoobies(filename) {
    var properties =  {}
      , currentPath = (path.extname(filename) !== '' ? filename.replace(/\/([^/]+)$/, '') : filename.replace(/\/$/, ''))
      , specialProperties = ['auth', 'forbidden']
      , i = 0;
    
    function mergeProperties(oldProperties, newProperties) {
        for (var key in oldProperties) {
            if (specialProperties.indexOf(key) === -1) {
                newProperties[ key ] = oldProperties[ key ];
            }
        }
        return newProperties;
    }
    
    while (this.path != currentPath && i < 10) {
        if (path.existsSync(currentPath +'/'+ this.propertyFilename)) {
            properties = mergeProperties(properties, JSON.parse(fs.readFileSync(currentPath +'/'+ this.propertyFilename)));
        }
        currentPath = currentPath.replace(/\/([^/]+)$/, '');
        i++;
    }
    
    if (path.existsSync(currentPath +'/'+ this.propertyFilename)) {
        properties = mergeProperties(properties, JSON.parse(fs.readFileSync(currentPath +'/'+ this.propertyFilename)));
    }
    
    return properties;
};

NoobHTTP.prototype.processRequest = function processRequest(req, res) {
    var self = this
      , realm = 'NoobHTTP Basic Auth'
      , requiresBasicAuth = this.auth
      , filename = path.normalize(this.path + req.url)
      , properties = this.getPathProperties(filename)
      , forbiddenRegex = new RegExp(this.forbiddenRegex, "gi");

    if (path.extname(filename) === '') {
        filename += (properties.hasOwnProperty('defaultIndex') ? properties.defaultIndex: 'index.html');
    }
    
    var log = getLog(req);
    if ((properties.hasOwnProperty('forbidden') && properties.forbidden) || req.url.match(forbiddenRegex)) {
        log.code = 403;
        self.logFile.write(JSON.stringify(log)+"\n");
        res.writeHead(403, {'Content-Type': 'text/plain'});
        res.end('Forbidden 403');
        return;
    }
    
    if (properties.hasOwnProperty('auth')) {
        requiresBasicAuth = true;
        realm = properties.auth.realm;
    }
    
    if (path.existsSync(filename)) {
        if (requiresBasicAuth) {
            if (!req.headers.hasOwnProperty('authorization')) {
                this.requestBasicAuth(realm, res, log);
                return;
            }

            var header=req.headers['authorization']||'', token=header.split(/\s+/).pop()||'', auth=new Buffer(token, 'base64').toString(), parts=auth.split(/:/)
              , username=parts[0]
              , password=parts[1];
            this.emit('authenticate', username, password, function (isAuthenticated) {
                if (isAuthenticated) {
                    self.response(filename, res, log);
                }
                else {
                    self.requestBasicAuth(realm, res, log);
                }
            });
        }
        else {
            this.response(filename, res, log);
        }
    }
    else {
        log.code = 404;
        self.logFile.write(JSON.stringify(log)+"\n");
        res.writeHead(404, {'Content-Type': 'text/plain'});
        res.end('File Not Found 404');
    }

};

function getLog(req) {
    return {
        ip: req.socket.remoteAddress,
        date: new Date(),
        pid: process.pid,
        method: req.method,
        url: req.url,
        referer: req.headers['referer'],
        "user-agent": req.headers['user-agent']
    };
}

module.exports.createServer = function (config) {
    config.isSSL = (!config.hasOwnProperty('isSSL') ? false : true)
    config.auth = (!config.hasOwnProperty('auth') ? false : true)
    if (!config.hasOwnProperty('path')) {
        config.path = Config('NoobHTTP').path['public'];
    }
    
    if (!config.hasOwnProperty('port')) {
        config.port = (config.isSSL ? 443 : 80);
    }
    
    return new NoobHTTP(config);
}
