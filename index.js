var fs = require('fs')
  , path = require('path')
  , cache = {
      idle_threshold: 300,
      ratio_threshold: 10,
      timeouts: {}
  }
  , Config = require('Config')
  , parseText = require('shared/TextParser').parse
  , files = {};

module.exports.processRequest = function processRequest(req, res, basePath) {
    var basePath = (basePath === undefined ? process.cwd() + '/public/' : basePath)
      , reqUrl = req.url;
    
    var filename = basePath +'index.html';
    if ('/' != reqUrl) {
        filename = basePath + reqUrl;
    }
    filename = path.normalize(filename);
  
    if (!files.hasOwnProperty(filename)) {
        files[ filename ] = {
            data: null,
            ratio: 0,
            lastCacheAccess: null
        };
    }

    var mimeType = 'text/plain';
    switch (path.extname(filename)) {
        case '.html':
            mimeType = 'text/html';
            break;
        case '.wav':
            mimeType = 'audio/wav';
            break;
        case '.mp3':
            mimeType = 'audio/mpeg';
            break;
        case '.ogg':
            mimeType = 'audio/ogg';
            break;
        case '.css':
            mimeType = 'text/css';
            break;
        case '.png':
            mimeType = 'image/png';
            break;
        case '.js':
            mimeType = 'application/x-javascript';
            break;
        case '.ini':
            mimeType = 'application/octet-stream';
            break;
    }

    if (files[ filename ]['data'] != null) {
        res.writeHead(200, {'Content-Type': mimeType});
        res.end(files[ filename ]['data']);

        files[ filename ]['lastCacheAccess'] = new Date();
    }
    else {

        function response(index, filename) {
            fs.readFile(filename, function (err, data) {
                if (err) {
                    res.writeHead(500, {'Content-Type': 'text/html'});
                    res.end(fs.readFileSync('public/errors/500.html'));
                }
                
                // if its require.js we need to parse the configs that starts the whole thing rolling
                if (filename.match(/require\.js$/)) {
                    data = parseText(Config('settings').NoobDesk, data.toString(), '{_', '_}');
                }
                
                res.writeHead(200, {'Content-Type': mimeType});
                res.end(data);

                if ((!cache['timeouts'].hasOwnProperty(index) || cache['timeouts'][ index ] == null) && files[ index ]['data'] == null) {
                    cache['timeouts'][ index ] = setTimeout(function (index, data) {
                        //  if the file exceeds the ratio threshold, we put it in memory
                        if (files[ index ]['ratio'] > cache['ratio_threshold']) {
                            files[ index ]['data'] = data;
                        }

                        // Reset the ratio every time
                        files[ index ]['ratio'] = 0;
                        clearTimeout(cache['timeouts'][ index ]);
                        cache['timeouts'][ index ] = null;
                    }, 1000, index, data);
                }

                files[ index ]['ratio']++;
            });
        }

        if (path.existsSync(filename)) {
            response(filename, filename);
        }
        // If its a js and is shared we return it
        else if ('js' == path.extname(filename) && path.existsSync(filename)) {
            response(filename, filename);
        }
        else {
            res.writeHead(404, {'Content-Type': 'text/html'});
            res.end(fs.readFileSync('public/errors/404.html'));
        }
    }
}

setInterval(cleanHttpCache, 600000);
function cleanHttpCache() {
    var date = new Date();
    for (var filename in files) {
        if (files[ filename ]['lastCacheAccess'] != null) {
            var idleTime = (date.getTime() - files[ filename ]['lastCacheAccess'].getTime()) / 1000;
            // if the cached file as exceeded its idle threshold we take it off the cache
            if (idleTime >= cache['idle_threshold']) {
                files[ filename ] = {
                    data: null,
                    ratio: 0,
                    lastCacheAccess: null
                };
            }
        }
    }

}
