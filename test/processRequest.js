var test = require('tap').test,
  fs = require('fs'),
  url = require('url'),
  Cookies = require('cookies'),
  server1 = null, serverReqMock;

server1 = new (require('../').Server)({
  home: "../test_public",
  port: 99999,
  parsableExtensions:  []
});

serverReqMock = {
  method: "GET",
  url: url.parse("/folder1/folder1-2/"),
  headers: {
    cookie: ""
  },
  noobhttp: {
    homedir: server1.home,
    eventString: "",
    data: "",
    cookies: new Cookies({headers: {cookies: ""}}, null),
    auth: {
      realm: 'Noob Realm',
      request: false,
      authorized: false
    },
    error: {},
    response: {}
  }
};

test("HTTP error codes", function (t) {
  t.plan(9);

  // Returns a code 404 when requesting a file that does not exists
  serverReqMock.url = url.parse("/folder1/bob.php");
  server1.processRequest(serverReqMock, {
    setHeader: function (key, value) {},
    writeHead: function (code, headers) {
      t.equal(code, 404, "Returns code 404 because file was not found");
    },
    end: function (content) {}
  });

  // Returns a code 405 when requesting a folder that has no index.html
  serverReqMock.url = url.parse("/folder1/");
  server1.processRequest(serverReqMock, {
    setHeader: function (key, value) {},
    writeHead: function (code, headers) {
      t.equal(code, 405, "Returns code 405 because no index.html was found");
    },
    end: function (content) {}
  });

  // Returns a code 405 when requesting a file that exists with a method other than GET
  serverReqMock.url = url.parse("/folder1/folder1-2/index.html");
  serverReqMock.method = "POST";
  server1.processRequest(serverReqMock, {
    setHeader: function (key, value) {},
    writeHead: function (code, headers) {
      t.equal(code, 405, "Returns code 405 POST is not supported for files");
    },
    end: function (content) {}
  });
  serverReqMock.method = "DELETE";
  server1.processRequest(serverReqMock, {
    setHeader: function (key, value) {},
    writeHead: function (code, headers) {
      t.equal(code, 405, "Returns code 405 DELETE is not supported for files");
    },
    end: function (content) {}
  });
  serverReqMock.method = "PUT";
  server1.processRequest(serverReqMock, {
    setHeader: function (key, value) {},
    writeHead: function (code, headers) {
      t.equal(code, 405, "Returns code 405 PUT is not supported for files");
    },
    end: function (content) {}
  });

  // Returns 500 error if the method file for a folder (.delete.js) does not reset the timeout within 2seconds
  serverReqMock.url = url.parse("/folder1/");
  serverReqMock.method = "DELETE"
  server1.processRequest(serverReqMock, {
    setHeader: function (key, value) {},
    writeHead: function (code, headers) {
      t.equal(code, 500, "Returns code 500 since the .delete.js method file did not clear the timeout");
    },
    end: function (content) {}
  });

  // Return to default mock method value
  serverReqMock.method = "GET";

  // Returns a code 403 when requesting anything that starts with a dot (.)
  serverReqMock.url = url.parse("/.templates");
  server1.processRequest(serverReqMock, {
    setHeader: function (key, value) {},
    writeHead: function (code, headers) {
      t.equal(code, 403, "Returns code 403 for a base folder that starts with a dot");
    },
    end: function (content) {}
  });
  serverReqMock.url = url.parse("/folder1/.wtf.bob");
  server1.processRequest(serverReqMock, {
    setHeader: function (key, value) {},
    writeHead: function (code, headers) {
      t.equal(code, 403, "Returns code 403 for a base file that starts with a dot");
    },
    end: function (content) {}
  });
  serverReqMock.url = url.parse("/.templates/layout.html");
  server1.processRequest(serverReqMock, {
    setHeader: function (key, value) {},
    writeHead: function (code, headers) {
      t.equal(code, 403, "Returns code 403 for requesting a file that has a parent directory that starts with a dot");
    },
    end: function (content) {}
  });

  t.test("Successfull requests", function (t) {
    t.plan(9);

    // Must find the index.html and return 200 and proper content when requesting a directory
    serverReqMock.url = url.parse("/folder1/folder1-2/");
    server1.processRequest(serverReqMock, {
      setHeader: function (key, value) {},
      writeHead: function (code, headers) {
        t.equal(code, 200, "Returns code 200 because there is a index.html in the folder");
      },
      end: function (content) {
        t.equal(content.toString(), "default index html", "Returns the proper content of the index.html that was found when requesting a folder");
      }
    });

    // Returns a 304 upon successful if-modified-since header check
    serverReqMock.url = url.parse("/folder1/folder1-2/index.html");
    serverReqMock.headers = {'if-modified-since': new Date().toUTCString()};
    server1.processRequest(serverReqMock, {
      setHeader: function (key, value) {},
      writeHead: function (code, headers) {
        t.equal(code, 304, "Returns code 304 because the file was not modified since today");
      },
      end: function (content) {}
    });

    // Returns a 304 upon successful if-none-match header check
    serverReqMock.url = url.parse("/folder1/folder1-2/index.html");
    var stats = fs.lstatSync(server1.home + "/folder1/folder1-2/index.html");
    serverReqMock.headers = {'if-none-match': '"' + stats.ino + '-' + stats.size + '-' + Date.parse(stats.mtime) + '"'};
    server1.processRequest(serverReqMock, {
      setHeader: function (key, value) {},
      writeHead: function (code, headers) {
        t.equal(code, 304, "Returns code 304 because the file's etag has not changed if-none-match");
      },
      end: function (content) {}
    });

    // Reset mock headers
    serverReqMock.headers = {};

    // Returns no content when the method is HEAD
    serverReqMock.url = url.parse("/folder1/folder1-2/index.html");
    serverReqMock.method = "HEAD"
    server1.processRequest(serverReqMock, {
      setHeader: function (key, value) {},
      writeHead: function (code, headers) {
        t.equal(code, 200, "Returns code 200 when the method is HEAD and file exists");
      },
      end: function (content) {
        t.notOk(content, "Returns no body when method is HEAD");
      }
    });

    // Returns the proper methods for a folder when the method is OPTIONS, and the files for the method supported exists
    serverReqMock.url = url.parse("/folder1/");
    serverReqMock.method = "OPTIONS"
    server1.processRequest(serverReqMock, {
      setHeader: function (key, value) {},
      writeHead: function (code, headers) {
        t.equal(code, 200, "Returns code 200 for method OPTIONS");
        t.equal(headers.allow, "OPTIONS, POST, DELETE", "Returns the proper OPTIONS for each method files that exists")
      },
      end: function (content) {
        t.notOk(content, "Returns no body when method is OPTIONS");
      }
    });

  });
});
server1.http_server.close();
