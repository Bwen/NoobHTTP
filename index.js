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
    
    this.auth = config.auth;
    this.name = config.name;
    this.path = config.path;
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
            res.writeHead(500, {'Content-Type': 'text/html'});
            res.end(fs.readFileSync('public/errors/500.html'));
            return;
        }

        log.code = 200;
        self.logFile.write(JSON.stringify(log)+"\n");
        res.writeHead(200, {'Content-Type': mime.lookup(filename)});
        res.end(data);
    });
};

NoobHTTP.prototype.requestBasicAuth = function requestBasicAuth(res, log) {
    log.code = 401;
    this.logFile.write(JSON.stringify(log)+"\n");
    res.writeHead(401, {
        'Content-Type': 'text/plain',
        'WWW-Authenticate': 'Basic realm="NoobHTTP"'
    });
    res.end('Authentication required');
};

NoobHTTP.prototype.processRequest = function processRequest(req, res) {
    var self = this
      , filename = this.path +'index.html';

    if ('/' != req.url) {
        filename = this.path + req.url;
    }
    filename = path.normalize(filename);

    var log = getLog(req);
    if (path.existsSync(filename)) {
        if (this.auth) {
            if (!req.headers.hasOwnProperty('authorization')) {
                this.requestBasicAuth(res, log);
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
                    self.requestBasicAuth(res, log);
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
        res.end('Error 404');
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
