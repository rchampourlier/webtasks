// ## Webtask `trello.prm`
//
// This webtask provides automation for a Trello "Personal Relationship
// Manager" use-case. The automations are described below.
//
// ### Requirements
//
// - This webtask is intended to be triggered by Trello webhooks.
//   You need to configure Trello's webhooks to call on the webtask URL
//   (path is simply `/`).
// - This webtask needs to be capable of performing Trello API calls. For
//   this, you will have to add the following secrets. You can get both
//   [here](https://trello.com/app-key).
//   - `api_key`
//   - `api_token`
//
// ### Task description
//
// #### Trigger conditions
//
// When a card is:
//   - commented,
//   - a label is added or removed.
//
// We ignore when:
//   - the card is created, because the label is not set yet,
//   - the card is updated, otherwise we would trigger again when the due
//     date is updated and go into a loop.
//
// #### Workflow
//
// Set the _due date_ to a new value. The new value is determined by adding
// a number of days corresponding to the label to the current date (today).
//
// Mapping:
//   - "action to take": 7 days
//   - "active contact": 30 days
//   - "passive contact": 90 days

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
 PERFORM TRELLO API CALLS
\****************************************/
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

/****************************************\
 EXPRESS ENDPOINTS
\****************************************/

app.head('/', function(req, res) {
  console.log('trello.prm -- HEAD /');
  res.sendStatus(200);
});

app.post('/', function (req, res) {
  const ctx = req.webtaskContext;
  console.log('trello.prm -- POST /');

  // Main workflow code
  const body = req.body;
  const actionType = body.action.type;

  // Trigger:
  //   - commented: "commentCard"
  //   - added label: "addLabelToCard"
  //   - removed label: "removeLabelFromCard"
  //
  // Action types are documented here:
  //   [Trello reference](https://developers.trello.com/v1.0/reference#action-types)
  //
  if (actionType === 'commentCard' ||
      actionType === 'addLabelToCard' ||
      actionType === 'removeLabelFromCard') {

    var cardID = body.action.data.card.id;

    // We need to fetch the card to get its labels.
    // GET /cards/<id>
    trelloAPICall(ctx, "GET", "/1/cards/" + cardID, '',
      (data) => { // success callback
        console.log('trello.prm -- trelloAPICall(..): ');
        console.log(data);
        var cardData = JSON.parse(data);
        var labels = cardData.labels;
        var labelNames = labels.map( (item) => { return item.name; } );

        var nDays;
        if (labelNames.includes("action to take")) {
          nDays = 7;
        }
        else if (labelNames.includes("active contact")) {
          nDays = 30;
        }
        else if (labelNames.includes("passive contact")) {
          nDays = 90;
        }

        // TODO: use the Trello event's time instead of now
        var date = new Date();
        var newDate = new Date(date.setTime(date.getTime() + nDays * 86400000));
        // LIMIT: arbitrary adding time, without taking calendar rules into account
        //   (e.g. timezones). Should be ok though in the context of this workflow,
        //   since we only want to set a due date, with no time.

        // Update the card with the new due date
        trelloAPICall(ctx, 'PUT', '/1/cards/' + cardID, {
          due: newDate.toISOString()
        }, () => {
          console.log('trello.prm -- updated card ' + cardID);
        }, (error) => {
          console.log('trello.prm -- could not update the card ' + cardID + '(' + error + ')');
        });
      }, // end of success callback

      (error) => { // error callback
        console.error("trello.prm - could not fetch the card (" + error + ")");
      }); // end of error callback
  }

  res.sendStatus(200);
});

/****************************************\
 PUBLISH EXPRESS ENDPOINTS
\****************************************/
var Webtask = require('webtask-tools');
module.exports = Webtask.fromExpress(app);
