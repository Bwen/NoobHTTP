
module.exports = function (req, res, timeout) {
  clearTimeout(timeout);

  res.writeHead(200, {'content-type': 'text/html'});
  res.end('<h2>hullo2</h2>');
}
