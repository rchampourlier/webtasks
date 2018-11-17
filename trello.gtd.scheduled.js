// ## Webtask `trello.prm`
//
// This webtask helps with scheduled tasks in a Trello board with a
// "Scheduled" cards list.
//
// ### Requirements
//
// - This webtask is intended to be triggered by Trello webhooks.
//   You need to configure Trello's webhooks to call on the webtask URL
//   (path is simply `/`).
// - This webtask needs to be capable of performing Trello API calls. For
//   this, you will have to add the following secrets. You can get both
//   [here](https://trello.com/app-key).
//   - `trello--api_key`
//   - `trello--api_token`
// - This webtask relies on another webtask (`trello.copy_card`) that must
//   be deployed and callable from this one. Add the `webtask_host` secret
//   with the Webtask host where it is deployed (e.g.
//   `https://wt-REPLACE.sandbox.auth0-extend.com)`.
//
// ### Task description
//  
// 01. Card created in "Scheduled" list --> set due date to the due 
//     date of the card above or today if first in the list
//
// 02. Due date added or changed --> move to "Scheduled" list
//     below last card with due date earlier
//
// 03. Due date removed --> move to "Tasks" with "asap" label
//
// 04. Card moved from the "Scheduled" list --> remove due date, add 
//     "asap" label
//
// 05. Card move to the "Scheduled" list --> trigger sort by due date
//
// TODOs
//   - Add "asap" label

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
 HELPERS
\****************************************/

const WEBTASK_NAME = 'trello.scheduled';
var log = (msg) => {
  console.log(WEBTASK_NAME + '  -- ' + msg);
};

var todayAsString = () => {
  var today = new Date();
  var dd = today.getDate();
  var mm = today.getMonth() + 1; // January is 0!
  var yyyy = today.getFullYear();
  if (dd < 10) {
      dd = '0' + dd;
  }
  if (mm < 10) {
      mm = '0' + mm;
  }
  today = mm + '/' + dd + '/' + yyyy;
  return today;
};

var serializeQueryString = obj => {
  var str = [];
  for (var p in obj)
    if (obj.hasOwnProperty(p)) {
      str.push(encodeURIComponent(p) + '=' + encodeURIComponent(obj[p]));
    }
  return str.join('&');
};

var noop = () => {};

/****************************************\
 PERFORM WEBTASKS CALLS
\****************************************/
var webtaskCall = (ctx, name, payload, onSuccess, onError) => {
  log('trigger webtask `' + name + '`');
  var webtaskHost = ctx.secrets.webtask_host;
  var payload_data = "";
  var headers = {
    'Content-Type': 'application/json',
  };
  if (payload !== undefined) {
    payload_data = JSON.stringify(payload);
    headers = _.merge(headers, { 'Content-Length': Buffer.byteLength(payload_data) });
  }
  const options = {
    hostname: webtaskHost,
    port: 443,
    path: "/" + name,
    method: "POST",
    headers: headers
  };

  const req = https.request(options, (res) => {
    res.setEncoding('utf8');
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

  if (payload !== undefined) {
    req.write(payload_data);
  }
  req.end();
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
  log('HEAD /');
  res.sendStatus(200);
});

app.post('/', function(req, res) {
  const ctx = req.webtaskContext;

  // Main workflow code
  const body = req.body;
  const actionType = body.action.type;

  // Action types are documented here:
  //   [Trello reference](https://developers.trello.com/v1.0/reference#action-types)

  var boardID, cardID, listID;
  switch (actionType) {

    // 01. Card created in "Scheduled" list --> set due date to the due 
    //     date of the card above or today if first in the list
    case 'createCard':
    // Check if in "Scheduled" list
    cardID = body.action.data.card.id;
    listID = body.action.data.list.id;

    // Fetch the list. Check its name
    trelloAPICall(ctx, "GET", "/1/lists/" + listID, {}, (listData) => {
      // Success callback
      listData = JSON.parse(listData);

      if (listData.name === "Scheduled") {
        // Fetch the list's cards
        trelloAPICall(ctx, "GET", "/1/lists/" + listID + "/cards", {}, (listCardsData) => {
          var cards = JSON.parse(listCardsData);
          cards.forEach( (currentCard, index) => {
            if (currentCard.id === cardID) {
              if (index === 0) {
                // If the card is first, set due date to today
                trelloAPICall(ctx, "PUT", "/1/cards/" + cardID, { "due": todayAsString() }, (successData) => {
                  log("Update created card to set due to today: success (" + successData + ")");
                }, (errorData) => {
                  log("Update created card to set due to today: error (" + errorData + ")");
                });
              } else {
                // Fetch the card above
                var previousCardID = cards[index - 1].id;
                trelloAPICall(ctx, "GET", "/1/cards/" + previousCardID, {}, (getCardsData) => {
                  // Fetched the previous card successfully
                  var previousCard = JSON.parse(getCardsData);
                  // Setting the created card due to the previous card's
                  trelloAPICall(ctx, "PUT", "/1/cards/" + cardID, { "due": previousCard.due }, (putCardData) => {
                    log("Update created card to set due to previous card's: success (" + putCardData + ")");
                  }, (errorData) => {
                    log("Update created card to set due to previous card's: error (" + errorData + ")");
                  });
                }, (errorData) => {
                  log("Fetch previous card: error (" + errorData + ")");
                });
              }
            }
          });
          // Else loop until card is the next one and set due date to the current card's
        }, (listCardsError) => { log("error: " + listCardsError);});
      }
      // Else: do nothing.
    }, (listError) => {
      // error callback
      log("error: " + listError);
    });
    break;

    // 02. Due date added or changed --> move to "Scheduled" list
    //     below last card with due date earlier
    // 03. Due date removed --> move to "Tasks" with "asap" label
    // 04. Card moved from the "Scheduled" list --> remove due date, add 
    //     "asap" label
    // 05. Card moved to the "Scheduled" list --> trigger sort by due date
    case 'updateCard':
    boardID = body.model.id;
    cardID = body.action.data.card.id;

    // Due date added, changed or removed (`action.data.old.due` is set) 
    if (body.action.data.old.due !== undefined) {
      listID = body.action.data.list.id; // defined in this context (e.g. not set if the card is moved).

      if (body.action.data.card.due === null) {
        // Case 03 - Due date removed
        // Move to "Next action" list
        var nextActionListID;

        // Find "Next action" list
        trelloAPICall(ctx, "GET", "/1/boards/" + boardID + "/lists", {}, (listsData) => {
          listsData = JSON.parse(listsData);
          listsData.forEach( (listsDataItem) => {
            if (listsDataItem.name === "Next action") {
              nextActionListID = listsDataItem.id;
              if (listID !== nextActionListID) {
                // Move the updated card to the found list
                trelloAPICall(
                  ctx, "PUT", "/1/cards/" + cardID,
                  { "idList": nextActionListID, "pos": "top" }, // TODO: add "asap" label
                  (successData) => {
                    log("move updated card to the \"Next action\" list: success (" + successData + ")");
                  }, (errorData) => {
                    log("move updated card to the \"Next action\" list: error (" + errorData + ")");
                });
              }
            }
          });
        }, (errorData) => { log("failed to fetch lists: " + errorData); } );
      }

      else {
        // Case 02 - Due data added or changed
        // Move to "Scheduled" list at the correct position (below last card with due date earlier)
        var scheduledListID;

        // Find "Scheduled" list
        trelloAPICall(ctx, "GET", "/1/boards/" + boardID + "/lists", {}, (listsData) => {
          listsData = JSON.parse(listsData);
          listsData.forEach( (listsDataItem) => {
            if (listsDataItem.name === "Scheduled") {
              scheduledListID = listsDataItem.id;
              if (listID !== scheduledListID) {
                // Move the updated card to the found list
                trelloAPICall(ctx, "PUT", "/1/cards/" + cardID, { "idList": scheduledListID }, (successData) => {
                  log("move updated card to the \"Scheduled\" list: success (" + successData + ")");
                }, (errorData) => {
                  log("move updated card to the \"Scheduled\" list: error (" + errorData + ")");
                });
              } else {
                // Updated card already in the "Scheduled" list
                //webtaskCall(ctx, "trello.sort_by_due", { "board_id": boardID, "list_id": scheduledListID }, (d) => { log(d); }, (d) => { log(d); } );
              }
            }
          });
        }, (errorData) => { log("failed to fetch lists: " + errorData); } );
      }
    }

    // 04. Card moved from the "Scheduled" list --> remove due date, add 
    //     "asap" label
    if (body.action.data.listAfter !== undefined && body.action.data.listBefore.name === "Scheduled") {
      // Card moved from "Scheduled" list

      // Remove card's due date
      trelloAPICall(ctx, "PUT", "/1/cards/" + cardID, { "due": null }, (putCardData) => {
        log("Update created card to set due to previous card's: success (" + putCardData + ")");
      }, (errorData) => {
        log("Update created card to set due to previous card's: error (" + errorData + ")");
      });
    }

    // 05. Card moved to the "Scheduled" list --> trigger sort by due date
    if (body.action.data.listAfter !== undefined && body.action.data.listAfter.name === "Scheduled") {
      // Card moved to "Scheduled" list

      scheduledListID = body.action.data.listAfter.id;

      // Trigger sort of "Scheduled" list by due date
      //webtaskCall(ctx, "trello.sort_by_due", { "board_id": boardID, "list_id": scheduledListID }, (d) => { log(d); }, (d) => { log(d); } );
    }

    break;
  }

  res.sendStatus(200);
});

/****************************************\
 PUBLISH EXPRESS ENDPOINTS 
\****************************************/
var Webtask = require('webtask-tools');
module.exports = Webtask.fromExpress(app);
