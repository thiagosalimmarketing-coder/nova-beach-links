const data = require('./_tmpdash_data.json');
module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.status(200).send(data[req.query.p] || '');
};
