// This webtask copies a Trello card.
//
// ### Details
//
// It copies:
//   - the card specified by the `source_card_id` param, with its
//     checklists, labels and attachments,
//   - to the board list specified by the `target_list_id` param
//     (at the top position).
//
// ### Requirements
//
// - This webtask needs to be capable of performing Trello API calls. For
//   this, you will have to add the following secrets. You can get both
//   [here](https://trello.com/app-key).
//   - `api_key`
//   - `api_token`
//
// ### How to use
//
// curl -X POST \
//   https://REPLACE.sandbox.auth0-extend.com/trello.copy_card \
//   -H 'Content-Type: application/json' \
//   -H 'cache-control: no-cache' \
//   -d '{"source_card_id": "REPLACE", "target_list_id": "REPLACE"}

/****************************************\
 INITIALIZE EXPRESS APP
\****************************************/
var express = require('express');
var bodyParser = require('body-parser');
var app = express();
app.use(bodyParser.json());

var https = require('https');
var _ = require('lodash');

var serializeQueryString = (obj) => {
  var str = [];
  for(var p in obj)
    if (obj.hasOwnProperty(p)) {
      str.push(encodeURIComponent(p) + "=" + encodeURIComponent(obj[p]));
    }
  return str.join("&");
};

var trelloAPICall = (ctx, verb, path, params, onSuccess, onError) => {
  var defaultParams = {
    key: ctx.secrets.api_key,
    token: ctx.secrets.api_token,
  };
  params = _.merge(defaultParams, params);
  var queryString = serializeQueryString(params);

  if (queryString.length > 0) {
    path += '?' + queryString;
  }

  const options = {
    hostname: 'api.trello.com',
    port: 443,
    path: path,
    method: verb
  };

  const req = https.request(options, (res) => {
    var dataStr = '';
    res.on('data', (chunk) => {
      dataStr += chunk;
    });

    res.on('end', function () {
      if (res.statusCode === 200) {
        onSuccess(dataStr);
      } else {
        onError(res.statusCode + ': ' + dataStr);
      }
    });
  });

  req.on('error', (e) => {
    onError(e);
  });

  req.end();
};

const log = (data) => { console.log(data); };

// Copy a card to the top of the list
var copyCard = function(ctx, sourceCardId, targetListId) {
  trelloAPICall(ctx, 'POST', '/1/cards/', {
    idList: targetListId,
    idCardSource: sourceCardId,
    pos: 'top',
    keepFromSource: 'checklists,labels,attachments'
  }, log, log );
};

/****************************************\
 EXPRESS ENDPOINTS
\****************************************/

app.head('/', function(req, res) {
  console.log('HEAD /');
  res.sendStatus(200);
});

app.post('/', function(req, res) {
  const ctx = req.webtaskContext;

  // Main workflow code
  const body = req.body;
  var sourceCardID = body.source_card_id;
  var targetListID = body.target_list_id;

  copyCard(ctx, sourceCardID, targetListID);

  res.sendStatus(200);
});

/****************************************\
 PUBLISH EXPRESS ENDPOINTS
\****************************************/
var Webtask = require('webtask-tools');
module.exports = Webtask.fromExpress(app);
