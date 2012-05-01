"use strict";
var fs = require('fs'),
    path = require('path'),
    util = require('util'),
    mime = require('mime');

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

function NoobHTTP(options) {
    var self = this;

    this.logEmit = true;
    if (options.hasOwnProperty('logEmit') && !options.logEmit) {
        this.logEmit = false;
    }

    this.forbiddenRegex = false;
    if (options.hasOwnProperty('files') && options.files.hasOwnProperty('forbidden')) {
        this.forbiddenRegex = options.files.forbidden;
    }

    this.propertyFilename = null;
    if (options.hasOwnProperty('files') && options.files.hasOwnProperty('property')) {
        this.property = options.files.property;
    }

    this.auth = options.auth;

    this.home = './public';
    if (options.hasOwnProperty('home')) {
        this.home = options.home;
    }
    this.home = fs.realpathSync(this.home);

    this.replacements = options.replacements;

    this.version = JSON.parse(fs.readFileSync(__dirname + "/package.json")).version;
    this.serverInfo = 'NoobHTTP/' + this.version;
    if (options.hasOwnProperty('serverInfo')) {
        this.serverInfo = options.serverInfo;
    }

    this.noobio = null;
    if (options.hasOwnProperty('socketio')) {
        this.noobio = options.socketio.of('/noobhttp');
        this.noobio.on('connection', function noobio_connection(socket) {
            socket.on('request', function noobio_request(file) {
                var filename = path.normalize(self.home + file);
                if (path.existsSync(filename)) {
                    fs.readFile(filename, function (err, data) {
                        if (err) {
                            socket.emit(file, {
                                code: 404,
                                msg: 'File "' + file + '" not found!'
                            }, undefined);
                            return;
                        }
                        socket.emit(file, undefined, self.replaceData.call(self, data.toString(), filename));
                    });
                } else {
                    socket.emit(file, {
                        code: 404,
                        msg: 'File "' + file + '" not found!'
                    }, undefined);
                    return;
                }
            });
        });
    }

    this.http_server = null;
    if (options.hasOwnProperty('http_server')) {
        this.http_server = options.http_server;
        return;
    }

    this.ssl = (options.hasOwnProperty('ssl') ? options.ssl : null);
    if (this.ssl) {
        if (this.ssl.hasOwnProperty('key') && this.ssl.hasOwnProperty('cert')) {
            this.http_server = require('https').createServer({
                key: this.ssl.key,
                cert: this.ssl.cert
            }, function (req, res) {
                self.processRequest.call(self, req, res);
            });
        } else {
            console.error('Error missing ssl properties key or cert');
            process.exit();
        }
    } else {
        this.http_server = require('http').createServer(function (req, res) {
            self.processRequest.call(self, req, res);
        });
    }

    this.http_server.listen(options.port);
}
util.inherits(NoobHTTP, require('eventemitter2').EventEmitter2);

NoobHTTP.prototype.replaceData = function replaceData(data, filename) {
    var extensions, key;
    if (this.replacements && Object.keys(this.replacements).length > 0) {
        for (extensions in this.replacements) {
            if (this.replacements.hasOwnProperty(extensions) && extensions.split(',').indexOf(path.extname(filename)) !== -1) {
                for (key in this.replacements[extensions]) {
                    if (this.replacements[extensions].hasOwnProperty(key)) {
                        data = data.toString().replace(key, this.replacements[extensions][key]);
                    }
                }
            }
        }
    }
    return data;
};

NoobHTTP.prototype.log = function log(code, entry, err) {
    if (!this.logEmit) {
        return;
    }

    if (err) {
        entry.error = err;
    }

    entry.code = code;
    this.emit('log.' + code, entry);
};

NoobHTTP.prototype.requestBasicAuth = function requestBasicAuth(realm, res, log) {
    this.log(401, log);
    res.writeHead(401, this.getResponseHeaders({
        'Content-Type': 'text/plain',
        'WWW-Authenticate': 'Basic realm="' + realm + '"'
    }));
    res.end('Authentication required');
    return;
};

NoobHTTP.prototype.getPathProperties = function getPathProperties(filename) {
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

    while (this.home != currentPath && i < 10) {
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

NoobHTTP.prototype.response = function response(filename, res, log) {
    var self = this;
    fs.readFile(filename, function (err, data) {
        if (err) {
            self.log(500, log, err);
            res.writeHead(500, self.getResponseHeaders({'Content-Type': 'text/plain'}));
            res.end('Internal Error');
            return;
        }

        self.log(200, log);
        res.writeHead(200, self.getResponseHeaders({'Content-Type': mime.lookup(filename)}));

        // if we need to replace markers for certain extensions we do so
        data = self.replaceData.call(self, data, filename);
        res.end(data);
        return;
    });
};

NoobHTTP.prototype.getResponseHeaders = function getResponseHeaders(headers) {
    if (!headers.hasOwnProperty('Server')) {
        headers.Server = this.serverInfo;
    }

    return headers;
};

NoobHTTP.prototype.processRequest = function processRequest(req, res) {
    var self = this,
        realm = 'NoobHTTP Basic Auth',
        requiresBasicAuth = this.auth,
        filename = path.normalize(this.home + req.url),
        properties = {},
        forbiddenRegex = false,
        log = getLog(req),
        header,
        auth,
        parts,
        username,
        password;

    if (this.forbiddenRegex) {
        forbiddenRegex = new RegExp(this.forbiddenRegex, "gi");
    }

    if (this.propertyFilename !== null) {
        properties = this.getPathProperties(filename);
    }

    if (path.extname(filename) === '') {
        filename += (properties.hasOwnProperty('defaultIndex') ? properties.defaultIndex : 'index.html');
    }

    if (properties.hasOwnProperty('https') && !this.ssl) {
        this.log(301, log);
        res.writeHead(301, self.getResponseHeaders({
            'Content-Type': 'text/plain',
            'Location': properties.https
        }));
        res.end('Moved Permanently');
        return;
    }

    if ((properties.hasOwnProperty('forbidden') && properties.forbidden) || (this.forbiddenRegex && path.basename(filename).match(forbiddenRegex))) {
        this.log(403, log);
        res.writeHead(403, self.getResponseHeaders({'Content-Type': 'text/plain'}));
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
        self.log(404, log);
        res.writeHead(404, self.getResponseHeaders({'Content-Type': 'text/plain'}));
        res.end('File Not Found 404');
        return;
    }

};

module.exports.createServer = function (options) {
    if (options == undefined) {
        options = {};
    }

    if (!options.hasOwnProperty('port')) {
        options.port = (options.hasOwnProperty('ssl') ? 443 : 80);
    }

    return new NoobHTTP(options);
};
