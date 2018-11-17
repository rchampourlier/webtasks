// ## Webtask `trello.prm`
//
// This webtask sorts a Trello list on due date when executed. The board
// and list IDs are passed as parameters of the endpoint. Trello credentials
// must be available from the secrets.
//
// ### Requirements
//
// - This webtask is intended to be triggered from other Webtasks.
// - The endpoint must be passed `board_id` and `list_id`
//   parameters.
// - This webtask needs to be capable of performing Trello API calls. For
//   this, you will have to add the following secrets. You can get both
//   [here](https://trello.com/app-key).
//   - `trello--api_key`
//   - `trello--api_token`
//
// ### Task description
//
// Sorts the specified Trello board's list on due dates, ascending.
//
// ### How to use?
//
// curl -X POST \
//   https://REPLACE.sandbox.auth0-extend.com/trello.sort_by_due \
//   -H 'Content-Type: application/json' \
//   -H 'cache-control: no-cache' \
//   -d '{"list_id": "REPLACE"}

/****************************************\
 INITIALIZE EXPRESS APP 
\****************************************/
var express = require('express');
var bodyParser = require('body-parser');
var app = express();
app.use(bodyParser.json());

var https = require('https');
var _ = require('lodash');

/****************************************\
 HELPER FUNCTIONS
\****************************************/

var serializeQueryString = obj => {
  var str = [];
  for (var p in obj)
    if (obj.hasOwnProperty(p)) {
      str.push(encodeURIComponent(p) + '=' + encodeURIComponent(obj[p]));
    }
  return str.join('&');
};

/****************************************\
 PERFORM TRELLO API CALLS
\****************************************/

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
    method: verb,
  };

  const req = https.request(options, res => {
    var dataStr = '';
    res.on('data', chunk => {
      dataStr += chunk;
    });

    res.on('end', function() {
      onSuccess(dataStr);
    });
  });

  req.on('error', e => {
    onError(e);
  });

  req.end();
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
  var listID = body.list_id;

  // Sort the list
  // Fetch the list's cards
  trelloAPICall(ctx, "GET", "/1/lists/" + listID + "/cards", {}, (data) => {
    var cards = JSON.parse(data);
    // We'll be doing a bubble sort since there will often (always?) be only
    // one card in a wrong position.

    // Listing cards and positions
    cards.forEach( (currentCard) => {
      console.log(currentCard.name + " / " + currentCard.due + " --> " + currentCard.pos);
    });

    cards.forEach( (currentCard, index) => {
      if (index === 0) {
        // Skip the first
        return;
      }
      // Bubble the current card up as needed
      var posOfNextTargetCard, indexOfNextTargetCard; // the "pos" and index of the card that should be directly below current
      for (var i = index - 1; i >= 0; i--) {
        var previousCard = cards[i];
        if (currentCard.due < previousCard.due) {
          indexOfNextTargetCard = i;
          posOfNextTargetCard = previousCard.pos;
        }
      }
      var newPos;
      if (indexOfNextTargetCard !== undefined) {
        if (indexOfNextTargetCard === 0) {
          newPos = posOfNextTargetCard / 2;
        } else {
          newPos = (posOfNextTargetCard + cards[indexOfNextTargetCard - 1].pos) / 2;
        }
        trelloAPICall(ctx, "PUT", "/1/cards/" + currentCard.id, { "pos": newPos }, (successData) => {
          console.log("Moved card `" + currentCard.name + "`: success (" + successData + ")");
        }, (errorData) => {
          console.log("Moved card `" + currentCard.name + "`: success (" + errorData + ")");
        });
      }
    });
  }, (error) => { console.log("error: " + error); });

  res.sendStatus(200);
});

/****************************************\
 PUBLISH EXPRESS ENDPOINTS 
\****************************************/
var Webtask = require('webtask-tools');
module.exports = Webtask.fromExpress(app);
