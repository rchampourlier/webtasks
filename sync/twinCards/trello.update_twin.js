// ## Webtask `trello.update_twin`
//
// This webtask provides automatic card sync between two Trello boards or lists.
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
// When status is updated on one card (card archived or unarchived),
// the twin card is updated too
//

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

var trelloAPICall = (ctx, verb, path, params = {}) =>
  new Promise((resolve, reject) => {
    var defaultParams = {
      key: ctx.secrets.api_key,
      token: ctx.secrets.api_token,
    };
    var allParams = _.merge(defaultParams, params);
    var queryString = serializeQueryString(allParams);
    var fullPath = path;

    if (queryString.length > 0) {
      fullPath += '?' + queryString;
    }

    const options = {
      hostname: 'api.trello.com',
      port: 443,
      path: fullPath,
      method: verb
    };

    const req = https.request(options, (res) => {
      var dataStr = '';
      res.on('data', (chunk) => {
        dataStr += chunk;
      });

      res.on('end', function () {
        if (res.statusCode >= 200 && res.statusCode <= 299) {
          console.log(verb + ' ' + path + ' with ' + JSON.stringify(params) + ' SUCCESS ');
          resolve(dataStr);
        } else {
          console.error(verb + ' ' + path + ' with ' + JSON.stringify(params) + ' FAIL');
          reject(res.statusCode + ': ' + dataStr);
        }
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    req.end();
  });

/****************************************\
 WORKFLOW FUNCTIONS
\****************************************/

var getWebhooks = (ctx) =>
  trelloAPICall(ctx, 'GET', '/1/tokens/' + ctx.secrets.api_token + '/webhooks', {});

var getAttachments = (ctx, cardID) =>
  // get attached cards
  trelloAPICall(ctx, 'GET', '/1/cards/' + cardID + '/attachments', {
    fields: 'id,url'
  });

var changeWebhookStatus = (ctx, webhookID, status) =>
  trelloAPICall(ctx, 'PUT', '/1/webhooks/' + webhookID, {
    active: status
  });

var updateCardStatus = (ctx, cardID, cardStatus) =>
  trelloAPICall(ctx, 'PUT', '/1/cards/' + cardID, {
    closed: cardStatus
  });

var changeWebhooksStatusForModel = async (ctx, modelID, status) => {
  try {
    // get all webhooks
    const webhooksData = await getWebhooks(ctx);
    const webhooks = JSON.parse(webhooksData);
    // filter to keep only relevant webhooks
    const modelWebhooks = webhooks.filter(webhook => (webhook.idModel === modelID && webhook.callbackURL === ctx.meta.webhook_URL));
    modelWebhooks.forEach(webhook => {
      var webhookID = webhook.id;
      // remove webhook
      changeWebhookStatus(ctx, webhookID, status);
    });
  }
  catch (err) {
    console.eroor('Could not change webhooks status for modelID ' + modelID);
    console.error(err);
  }
};

var updateCardStatusWithoutWebhook = async (ctx, cardID, status) => {
  try {
      // deactivate webhook on twin card
      await changeWebhooksStatusForModel(ctx, cardID, false);
      // update the copy card status
      await updateCardStatus(ctx, cardID, status);
      // activate webhook on twin card  }
      await changeWebhooksStatusForModel(ctx, cardID, true);
  }
  catch (err) {
    console.error('Could not update card without webhook for ' + cardID);
    console.error(err);
  }
};

var workflowOnToggleCardStatus = async (ctx, cardID, cardStatus) => {
  try {
    // get attached cards
    const attachmentsData = await getAttachments(ctx, cardID);
    const attachments = JSON.parse(attachmentsData);
    const cardsAttachments = attachments.filter(attachment => /https:\/\/trello\.com\/c\/(\w*)/.test(attachment.url));
    cardsAttachments.forEach(attachment => {
      // get the twin cards ID
      var copyID = attachment.url.replace('https://trello.com/c/', '');
      updateCardStatusWithoutWebhook(ctx, copyID, cardStatus);
    });
  }
  catch (err) {
    console.error('could not complete workflow toggle card status for card ' + cardID);
    console.error(err);
  }
};

/****************************************\
 EXPRESS ENDPOINTS
\****************************************/

app.head('/', function(req, res) {
  console.log('trello.update_twin -- HEAD /');
  res.sendStatus(200);
});

app.post('/', function (req, res) {
  const ctx = req.webtaskContext;
  console.log('trello.update_twin -- POST /');

  // Main workflow code
  const body = req.body;
  const actionType = body.action.type;
  const cardID = body.action.data.card.id;
  const cardStatus = body.action.data.card.closed;

  // Trigger:
  //   - card updated : "updateCard"
  //   - the card status was updated (closed/open)
  if (actionType === 'updateCard' &&
      cardStatus !== undefined) {
    workflowOnToggleCardStatus(ctx, cardID, cardStatus);
  }


  res.sendStatus(200);
});

/****************************************\
 PUBLISH EXPRESS ENDPOINTS
\****************************************/
var Webtask = require('webtask-tools');
module.exports = Webtask.fromExpress(app);
