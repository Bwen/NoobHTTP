# NoobHTTP
The version 0.5.0 breaks backward compatibility. I remade the whole thing from scratch to take full advantage of the EventEmitter2.

The module NoobHTTP as just one property and its `.Server`, which is an object. Its constructor accepts one argument. The possible options for that argument are as follow with their default values:

```javascript
{
  serverInfo: "NoobHTTP/0.5.0", // Sent as the HTTP header Server.
  home: "./public", // defines where all the public files resides.
  port: 80, // The port the server is to listen on. Defaults to 80 /443 depending on ssl config property.
  ssl: { // key & cert required for an HTTPs server.
    key: null,
    cert: null,
  },
  parsableExtensions: [".html"], // extensions that should be parsed for the mini-templating system.
  availableLanguages: ["en"], // available languages for negociating a language with the browser.
  cache: {
    dir: "/tmp/noobhttp/cache", // where to put the mini-templating complied files.
    days: 2 // this will be sent as the HTTP header Expires, adding it to the mtime of the file.
  },
  http_server: http_server // Already initiated HTTP Server, will not try to listen or initiate a server.
}
```

The first thing to know is that for every request NoobHTTP will add a property `.noobhttp` to the *ClientRequest* object as follow:
```javascript
ClientRequest.noobhttp = {
  homedir: this.home,
  eventString: eventString,
  cookies: new Cookies(req, res),
  language: this.getRequestLanguage(req),
  data: null, // contains the data/body of the request
  error: {
    headers: {}, // headers that will be used to send the error page
    data: '' // body of the error response
  },
  response: {
    file: "/var/www/domain.com/directory/file.html", // absolute path of the file found
    data: '', // Body of the response
  },
  auth: {
    realm: 'Noob Realm',
    request: false,
    authorized: false
  }
}
```
Another important thing to know is that the property `ClientRequest.url` is parsed and replaced by the module `url`.
`ClientRequest.url = url.parse(ClientRequest.url, true);`

Also the `req.headers.host` is modified to always include the port to be consistent, since its used for all event strings.

All files that are greater than 1 MegaByte will be streamed.

The server will also serve shared files, in the file `sharedFiles.js` that resides at the root of the module you can add files as follow:
```javascript
module.exports = {
  'Class.js': 'Class.js',
  'EventEmitter2.js': 'node_modules/eventemitter2/lib/eventemitter2.js',
  'uuid.js': 'node_modules/node-uuid/uuid.js'
};
```
You can specify files that you want to serve without having them be in the public directory.

# 4 types of events

### Requests
For every request sent to the server an event will be emitted in the following syntax `request/domain.com:80/GET/directory/file.html`. The way the server checks if the file exists on the server is as follow: `var file = path.normalize(req.noobhttp.homedir + req.url.pathname);`; The only argument passed to the event is the `ClientRequest` which can be altered to change the behavior of the server.

For example, if we wanted to make all requests that starts with `/video` point to a different folder than the home we would do something like:
```javascript
server.on('request/*/GET/video/**', function (req) {
  req.noobhttp.homedir = '/media/videos';
  req.url.pathname = req.url.pathname.replace(/\/video/, '');
});
```

Another interesting example would be to prefix the requests' url with its domain name, giving the possibility to host more than one domain/site with the server.
```javascript
server.on('request/**', function (req) {
  req.url.pathname = "/" + req.headers.host.split(':')[0] + req.url.pathname;
});
```
One should be cautious with the order of the events...

### Responses
For every response the server will emit an event in the following syntax: `response/domain.com:80/GET/directory/file.html`. The only argument passed to the event is the `ClientRequest` which can be altered to change the behavior of the server. Before emitting this event the property `ClientRequest.noobhttp.response` is added. It contains the following:
```javascript
{
  file: "/var/www/domain.com/directory/file.html", // The absolute path to the file that was found
  data: Buffer // The buffer that was returned by the fs.readFile()
}
```

### Errors
For every error the server encounters it will emit an event in the following syntax: `error/domain.com:80/404`. The event receives two arguments the first one is for the error code and the second is the `ClientRequest` which can be altered to change the behavior of the server. Before emitting this event the property `ClientRequest.noobhttp.error` is added. It contains the following:
```javascript
{
  headers: {'content-type': 'text/plain'},
  data: '404 File Not Found'
}
```

This can be useful to have personalized error pages, like so:
```javascript
server.on('error/**', function (code, req) {
  req.response.headers = {'content-type': 'text/html'};
  req.response.data = '<h1>' + code + " " +req.response.data + '</h1>';
});
```

### Authentications
When a event for a request is emitted the callback as the opportunity to change the following property `ClientRequest.noobhttp.auth.request` to `true`. Doing so will make the server request a basic authentication to the browser and emit an auth event in the following syntax: `auth/domain.com:80/directory/file.html`. It will pass 3 arguments, the first is the `ClientRequest`, the second is the username and the third is the password.

The event MUST validate the username & password and change the following property `ClientRequest.noobhttp.auth.authorized` to `true` otherwise the server will keep prompting for the browser to authenticate itself.

Example where we want every request to be authenticated:
```javascript
server.on('request/**', function (req) {
  req.noobhttp.auth.request = true;
});

server.on('auth/**', function (req, username, password) {
  req.noobhttp.auth.authorized = myAuthFunction(username, password);
});
```

# HTTP Methods
The server supports the HTTP method "OPTIONS", which queries the server to see which methods are available for a given resource. For now the only methods that are not implemented are "TRACE" and "CONNECT", and will return a 501 (Not Implemented) code if ever requested.

The only methods that are available for __files__ are "OPTIONS" and "GET", any other methods requested for a __file__ will get 405 (Method Not Allowed).

The methods available for __directories__ are "OPTIONS", "GET", "POST", "DELETE" and "PUT". When requesting a __directory__ resource the server will check if it can find the following files in the directory: `.get.js`, `.post.js`, `.delete.js` and `.put.js` and will compile a list of methods supported for the requested directory and will return it as the HTTP header "Allow" if the method is OPTIONS. If the method requested for the directory does not have a file for it the server will return a 405 (Method Not Allowed).

Otherwise it will require that file and call its export as a function passing it 3 arguments. The first one is the `ClientRequest`, second is the `ClientResponse` and the third is a reference to a `setTimeout(,2000);` that needs to be cleared by the module. Otherwise an 500 (Internal Error) will be sent to the browser.

If the method requested for a __directory__ is "GET" and the file `.get.js` is not present in the directory the server will check to see if the file `index.html` is present and alter the requested file for it.

The server supports the method "HEAD".

# HTTP Headers
Typical headers sent from the server for a simple request
```
server: NoobHTTP/0.5.0
content-type: text/html
content-length: 908
last-modified: Sun, 08 Jul 2012 21:24:01 GMT
etag: "516162-908-1341782641000"
accept-ranges: bytes
cache-control: public, must-revalidate
expires: Tue, 10 Jul 2012 21:24:01 GMT
x-powered-by: Node.js/0.8.0
x-generated-by: a noob... xD
x-xss-protection: 1; mode=block
x-content-type-options: nosniff
```

It supports the following headers sent from the client: `if-modified-since`, `if-none-match`, `range`, `if-range`, `cache-control`.


# Mini-Templating system
This is a very simple file include system for files that have a parsable extension. The server will crawl the directories up to the `.home` and identifies `.templates` folders for the request. If the requested file has a marker `{noobhttp-layout}` it will find the nearest `layout.html`. It will do the same for the markers `{noobhttp-include file=header.html}`. It will always crawl the directories from the requested file's folder and will always take the first file it finds.

When a parsable extension is compiled it is saved in the `cache.dir` config and the http headers are modified accordingly.

Example,
requested file `/dir1/dir2/index.html`
```html
{noobhttp-layout}
<div>hullo world</div>
```

file `/.templates/layout.html`
```html
<!DOCTYPE html>
<html>
    <head>
        <title>hullo world</title>
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
    </head>
<body>
{noobhttp-include file=header.html}
{noobhttp-content}
{noobhttp-include file=footer.html}
</body>
</html>
```

file `/dir1/.templates/header.html`
```html
<header>hullo header</header>
```

__the result would give__:

```html
<!DOCTYPE html>
<html>
    <head>
        <title>hullo world</title>
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
    </head>
<body>
<header>hullo header</header>
<div>hullo world</div>
</body>
</html>
```
