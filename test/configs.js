var test = require('tap').test,
  fs = require('fs'),
  server1 = null, server2 = null;

server1 = new (require('../').Server)({
  home: "../test_public",
  port: 99999
});

test("Default properties set by the server", function (t) {
  t.equal(server1.home, fs.realpathSync("../test_public"),    "The home directory is ../test_public like it was set for the test");
  t.equal(server1.port, 99999,                                "Port is 99999 like it was set for the test");
  t.equal(server1.version.split('.').length, 3,               "Version is length of 3");
  t.equal(server1.serverInfo, 'NoobHTTP/' + server1.version,  "Server info is NoobHTTP/x.x.x");
  t.equal(server1.parsableExtensions.length, 1,               "Parsable extensions has only one element");
  t.equal(server1.parsableExtensions[0], ".html",             "Parsable extensions only have the .html");
  t.equal(server1.cache.dir, "/tmp/noobhttp/cache",           "Cache dir for the mini-templating system is /tmp/noobhttp/cache");
  t.equal(server1.cache.days, 2,                              "Cache days for the mini-templating system is 2 days");
  t.equal(server1.availableLanguages.length, 1,               "Available languages only has 1 element");
  t.equal(server1.availableLanguages[0], "en",                "Available languages only contains the english");
  server1.http_server.close();
  t.end();
});


server2 = new (require('../').Server)({
  serverInfo: "Bobby Server/1.3.4",
  parsableExtensions: [".js", ".php"],
  availableLanguages: ["fr", "es"],
  cache: {
    dir: "/tmp/cache",
    days: 20
  },
  home: "../test_public",
  port: 99998
});
test("Configs are set properly when passed to the constructor", function (t) {
  t.equal(server2.serverInfo, "Bobby Server/1.3.4",  "Server info is Bobby Server/1.3.4");
  t.equal(server2.parsableExtensions.length, 2,      "Parsable extensions has only one element");
  t.equal(server2.parsableExtensions[0], ".js",      "Parsable extensions only have the .js and .php");
  t.equal(server2.parsableExtensions[1], ".php",     "Parsable extensions only have the .js and .php");
  t.equal(server2.cache.dir, "/tmp/cache",           "Cache dir for the mini-templating system is /tmp/cache");
  t.equal(server2.cache.days, 20,                    "Cache days for the mini-templating system is 20 days");
  t.equal(server2.availableLanguages.length, 2,      "Available languages only has 1 element");
  t.equal(server2.availableLanguages[0], "fr",       "Available languages only contains the french and spanish");
  t.equal(server2.availableLanguages[1], "es",       "Available languages only contains the french and spanish");
  server2.http_server.close();
  t.end();
});
