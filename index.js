"use strict";
var fs = require('fs'),
    path = require('path'),
    util = require('util'),
    mime = require('mime'),
    config = require('NoobConfig');


function getLog(req) {
    return {
        ip: req.socket.remoteAddress,
        date: new Date(),
        pid: process.pid,
        method: req.method,
        url: req.url,
        referer: req.headers.referer,
        "user-agent": req.headers['user-agent']
    };
}

function NoobHTTP(cfg) {
    var self = this,
        now = new Date(),
        date = now.getFullYear()
            + '.' + (now.getMonth() < 10 ? '0' + now.getMonth() : now.getMonth())
            + '.' + (now.getDate() < 10 ? '0' + now.getDate() : now.getDate());
    this.logFile = fs.createWriteStream(config('NoobHTTP').path.logs + cfg.name + '.' + date + '.log', {'flags': 'a'});

    this.forbiddenRegex = config('NoobHTTP').filename.forbiddenRegex;
    this.propertyFilename = config('NoobHTTP').filename.property;
    this.auth = cfg.auth;
    this.name = cfg.name;
    this.path = fs.realpathSync(cfg.path);
    this.isSSL = cfg.isSSL;
    this.http_server = null;
    this.replacements = cfg.replacements;

    // if we already have server in the config we dont initiate a new one
    if (cfg.hasOwnProperty('http_server')) {
        this.http_server = cfg.http_server;
        return;
    }

    if (cfg.isSSL) {
        this.http_server = require('https').createServer({
            key: fs.readFileSync(config('NoobHTTP').path.ssl + 'privatekey.pem'),
            cert: fs.readFileSync(config('NoobHTTP').path.ssl + 'certificate.pem')
        }, function (req, res) {
            self.processRequest.call(self, req, res);
        });
    } else {
        this.http_server = require('http').createServer(function (req, res) {
            self.processRequest.call(self, req, res);
        });
    }

    this.http_server.listen(cfg.port);
}
util.inherits(NoobHTTP, require('events').EventEmitter);

NoobHTTP.prototype.replaceData = function replaceData(data, filename) {
    var extensions, key;
    if (this.replacements && Object.keys(this.replacements).length > 0) {
        data = data.toString();
        for (extensions in this.replacements) {
            if (this.replacements.hasOwnProperty(extensions) && extensions.split(',').indexOf(path.extname(filename)) !== -1) {
                for (key in this.replacements[extensions]) {
                    if (this.replacements[extensions].hasOwnProperty(key)) {
                        data = data.replace(key, this.replacements[extensions][key]);
                    }
                }
            }
        }
    }
    return data;
};

NoobHTTP.prototype.response = function response(filename, res, log) {
    var self = this;

    fs.readFile(filename, function (err, data) {
        if (err) {
            log.error = err;
            log.code = 500;
            self.logFile.write(JSON.stringify(log) + "\n");
            res.writeHead(500, {'Content-Type': 'text/plain'});
            res.end('Internal Error');
            return;
        }

        log.code = 200;
        self.logFile.write(JSON.stringify(log) + "\n");
        res.writeHead(200, {'Content-Type': mime.lookup(filename)});

        // if we need to replace markers for certain extensions we do so
        data = self.replaceData.call(self, data, filename);

        res.end(data);
    });
};

NoobHTTP.prototype.requestBasicAuth = function requestBasicAuth(realm, res, log) {
    log.code = 401;
    this.logFile.write(JSON.stringify(log) + "\n");
    res.writeHead(401, {
        'Content-Type': 'text/plain',
        'WWW-Authenticate': 'Basic realm="' + realm + '"'
    });
    res.end('Authentication required');
};

NoobHTTP.prototype.getPathProperties = function findBoobies(filename) {
    var properties =  {},
        currentPath = (path.extname(filename) !== '' ? filename.replace(/\/([^/]+)$/, '') : filename.replace(/\/$/, '')),
        specialProperties = ['auth', 'forbidden'],
        i = 0;

    function mergeProperties(oldProperties, newProperties) {
        var key;
        for (key in oldProperties) {
            if (oldProperties.hasOwnProperty(key) && specialProperties.indexOf(key) === -1) {
                newProperties[key] = oldProperties[key];
            }
        }
        return newProperties;
    }

    while (this.path != currentPath && i < 10) {
        if (path.existsSync(currentPath + '/' + this.propertyFilename)) {
            properties = mergeProperties(properties, JSON.parse(fs.readFileSync(currentPath + '/' + this.propertyFilename)));
        }
        currentPath = currentPath.replace(/\/[^/]+$/, '');
        i += 1;
    }

    if (path.existsSync(currentPath + '/' + this.propertyFilename)) {
        properties = mergeProperties(properties, JSON.parse(fs.readFileSync(currentPath + '/' + this.propertyFilename)));
    }

    return properties;
};

NoobHTTP.prototype.processRequest = function processRequest(req, res) {
    var self = this,
        realm = 'NoobHTTP Basic Auth',
        requiresBasicAuth = this.auth,
        filename = path.normalize(this.path + req.url),
        properties = this.getPathProperties(filename),
        forbiddenRegex = new RegExp(this.forbiddenRegex, "gi"),
        log,
        header,
        auth,
        parts,
        username,
        password;

    if (path.extname(filename) === '') {
        filename += (properties.hasOwnProperty('defaultIndex') ? properties.defaultIndex : 'index.html');
    }

    log = getLog(req);
    if (properties.hasOwnProperty('https') && !this.isSSL) {
        log.code = 301;
        this.logFile.write(JSON.stringify(log) + "\n");
        res.writeHead(301, {
            'Content-Type': 'text/plain',
            'Location': properties.https
        });
        res.end('Moved Permanently');
    }

    if ((properties.hasOwnProperty('forbidden') && properties.forbidden) || path.basename(filename).match(forbiddenRegex)) {
        log.code = 403;
        this.logFile.write(JSON.stringify(log) + "\n");
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

            header = (req.headers.authorization || '');
            auth = new Buffer((header.split(/\s+/).pop() || ''), 'base64').toString();
            parts = auth.split(/:/);
            username = parts[0];
            password = parts[1];

            this.emit('authenticate', username, password, req.socket.remoteAddress, function (isAuthenticated) {
                if (isAuthenticated) {
                    self.response(filename, res, log);
                } else {
                    self.requestBasicAuth(realm, res, log);
                }
            });
        } else {
            this.response(filename, res, log);
        }
    } else {
        log.code = 404;
        self.logFile.write(JSON.stringify(log) + "\n");
        res.writeHead(404, {'Content-Type': 'text/plain'});
        res.end('File Not Found 404');
    }

};

module.exports.createServer = function (config) {
    config.isSSL = (!config.hasOwnProperty('isSSL') ? false : true);
    config.auth = (!config.hasOwnProperty('auth') ? false : true);
    if (!config.hasOwnProperty('path')) {
        config.path = config('NoobHTTP').path['public'];
    }

    if (!config.hasOwnProperty('port')) {
        config.port = (config.isSSL ? 443 : 80);
    }

    return new NoobHTTP(config);
};
