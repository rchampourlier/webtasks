// This webtask may be used to display webhook contents.
//
// ### Requirements
//
// - This webtask is intended to be triggered by webhooks.
//   You need to configure webhooks to call on the webtask URL
//   (path is simply `/`).

/****************************************\
 INITIALIZE EXPRESS APP
\****************************************/
var express = require('express');
var bodyParser = require('body-parser');
var app = express();
app.use(bodyParser.json());

/****************************************\
 EXPRESS ENDPOINTS
\****************************************/

app.head('/', function(req, res) {
  console.log('webhook.sandbox -- HEAD /');
  res.sendStatus(200);
});

app.post('/', function (req, res) {
  console.log('webhook.sandbox -- POST /');

  console.log(JSON.stringify(req.body, null, 2));

  res.sendStatus(200);
});

/****************************************\
 PUBLISH EXPRESS ENDPOINTS
\****************************************/
var Webtask = require('webtask-tools');
module.exports = Webtask.fromExpress(app);
