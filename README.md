## NoobHTTP
This is meant to be a simple static files http server. It is geared towards
webapps with socket.io. The reason why the http server __offers__ a hook,
and thus optional, via web sockets is to be able dynamically load files cross domains.

For example if you are on domain1.com and you add a script tag to include a js script
from domain2.com the js script will not be able to load files with XMLHttpRequest from
its domain2.com.

For client side utils that I use with NoobHTTP visit: https://github.com/Bwen/NoobUtils

## Features
 - HTTP & HTTPS
 - BasicAuth
 - Regex for forbidden files
 - Property system, a bit like .htaccess
 - Emit logs, which can be turned off
 - More to come...

## Using NoobHTTP
The way to instantiate the NoobHTTP is done by passing an options object as parameter.

All the posibilities are below:
```javascript
    var http_server = require('http').createServer(function (req, res) {
        }),
        io = require('socket.io').listen(http_server),
        server = require('NoobHTTP').createServer({
            home: './public/',
            port: 80,
            logEmit: true,
            serverInfo: "NoobHTTP/1.0",
            http_server: http_server,
            socketio: io,
            files: {
                forbidden: "^\.",
                property: ".noob.json"
            },
            ssl: {
                key: fs.readFileSync('./ssl/privatekey.pem'),
                cert: fs.readFileSync('./ssl/certificate.pem')
            }
            replacements: {
                '.js,.css,.html': {
                    "__hostUrl__": "https://domain2.com:9000/"
                }
            }
        });
```

```javascript
    home: './public/'
```
This property is __optional__ and defaults to `./public/`.
Defines the root of the server.


```javascript
    port: 80
```
This property is __optional__ and defaults to 80 or 443 if the property "ssl" exists in the options


```javascript
    logEmit: true
```
This property is __optional__ and defaults to `true`.
Gives the posibility to have no logs being emitted.


```javascript
    serverInfo: "NoobHTTP/1.0"
```
This property is __optional__ and defaults to `NoobHTTP/` and the version in the package.json.
It is put in every response headers as the key 'Server:'.


```javascript
    http_server: require('https')
```
This property is __optional__ and defaults to null.
If this option is specified the NoobHTTP will not instantiate a new http server
and will not bind itself to it.


```javascript
    socketio: require('socket.io')
```
This property is __optional__ and defaults to null.
If this option is specified it will make a new namespace "noobhttp" and listen
events "request" with a file parameter. It will reponse with an emit of the file
name that was requested with either the content of the file or an error object.


```javascript
    files: {
        forbidden: "^\.",
        property: ".noob.json"
    }
```
Theses two options are __optionals__ and defaults to null.
The forbidden regexp option will default to false. If provided as the example all the
files that starts with a dot will be responded with a 403.

The property option will default to false. If provided as the example every time the
NoobHTTP receives a request for a file it will crawl the directory up to its home
directory and look for this property file name. Right now the property file name is of
json type and supports only 2 options. {"auth": true} which forces a directory to request
for a BasicAuth and {"https":"https://domain2.com/"} which enforces the url to be in https
and thus redirects the browser with a 301.


```javascript
    ssl: {
        key: fs.readFileSync('./ssl/privatekey.pem'),
        cert: fs.readFileSync('./ssl/certificate.pem')
    }
```
This property is __optional__ and will default to null.
If you want the server to be ssl this is ofcourse required.


```javascript
    replacements: {
        '.js,.css,.html': {
            "__hostUrl__": "https://domain2.com:9000/"
        }
    }
```
Theses two options are __optionals__ and defaults to null.
This gives the chance to specify markers to be replaced in certain extensions. Like
mentioned in the beginning when including js script cross domains you want to be able
to load static files (html templates) from the domain where the js comes from. Instead
of hardcoding certain values this can be used.
