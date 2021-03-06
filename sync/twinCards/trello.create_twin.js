// ## Webtask `trello.create_twin`
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
// - This webtask needs to know the webhook url to add, the list where the
//   card will be copied and the member ID used as a trigger. For
//   this, you will have to add the following metas. (use trello sandbox to
//   get the IDs)
//   - `webhook_URL` --> url to update_twin webtask
//   - `target_list_ID` --> list where the twin card will be created
//   - `ref_member_ID` --> trello user that will trigger the sync when assigned to the card
//
// ### Task description
//
// #### Trigger conditions
//
// When a specific user is added on a card,
// copy the card to another board
// add a link between cards
// add webhooks on both cards for synchronisation
//
// When the specific user is removed from card,
// delete the twin card, links and webhooks

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
var copyCard = (ctx, cardID) =>
  trelloAPICall(ctx, 'POST', '/1/cards/', {
    idList: ctx.meta.target_list_ID,
    idCardSource: cardID,
    pos: 'top',
    keepFromSource: ''
  });

var linkCard = (ctx, cardID1, cardID2) =>
  trelloAPICall(ctx, 'POST', '/1/cards/' + cardID1 + '/attachments/', {
    url: 'https://trello.com/c/' + cardID2,
  });

var removeLinkCard = (ctx, cardID1, attachmentID) =>
  trelloAPICall(ctx, 'DELETE', '/1/cards/' + cardID1 + '/attachments/' + attachmentID);

// TODO: only create webhook if it doesn't exists
var createWebhookOnModel = (ctx, modelID) =>
  trelloAPICall(ctx, 'POST', '/1/webhooks/', {
      callbackURL: ctx.meta.webhook_URL,
      idModel: modelID
    });

var deleteWebhook = (ctx, webhookID) =>
  trelloAPICall(ctx, 'DELETE', '/1/webhooks/' + webhookID);

var getWebhooks = (ctx) =>
  trelloAPICall(ctx, 'GET', '/1/tokens/' + ctx.secrets.api_token + '/webhooks', {});

var getAttachments = (ctx, cardID) =>
  // get attached cards
  trelloAPICall(ctx, 'GET', '/1/cards/' + cardID + '/attachments', {
    fields: 'id,url'
  });

var closeCard = (ctx, cardID) =>
  trelloAPICall(ctx, 'PUT', '/1/cards/' + cardID, {
    closed: true
  });

var deleteWebhooksOnModel = async (ctx, modelID) => {
  try {
    // get all webhooks
    const webhooksData = await getWebhooks(ctx);
    const webhooks = JSON.parse(webhooksData);
    // filter to keep only relevant webhooks
    const modelWebhooks = webhooks.filter(webhook => (webhook.idModel === modelID && webhook.callbackURL === ctx.meta.webhook_URL));
    modelWebhooks.forEach(webhook => {
      var webhookID = webhook.id;
      // remove webhook
      deleteWebhook(ctx, webhookID);
    });
  }
  catch (err) {
    console.error('Could not remove webhooks for modelID ' + modelID);
    console.error(err);
  }
};

var workflowOnAddMember = async (ctx, cardID) => {
  try {
    // copy card and get ID of the twin card
    const copyData = await copyCard(ctx, cardID);
    var copyID = JSON.parse(copyData).id;
    // cross link the cards
    linkCard(ctx, cardID, copyID);
    linkCard(ctx, copyID, cardID);
    // create webhooks
    createWebhookOnModel(ctx, cardID);
    createWebhookOnModel(ctx, copyID);
  }
  catch (err) {
    console.error('could not complete workflow add member for card ' + cardID);
    console.error(err);
  }
};

var workflowOnRemoveMember = async (ctx, cardID) => {
  try {
    // get attached cards
    const attachmentsData = await getAttachments(ctx, cardID);
    const attachments = JSON.parse(attachmentsData);
    const cardsAttachments = attachments.filter(attachment => /https:\/\/trello\.com\/c\/(\w*)/.test(attachment.url));
    cardsAttachments.forEach(attachment => {
      // get the twin cards ID
      var copyID = attachment.url.replace('https://trello.com/c/', '');
      var attachmentID = attachment.id;
      // remove both webhooks
      deleteWebhooksOnModel(ctx, copyID);
      deleteWebhooksOnModel(ctx, cardID);
      // archive the linked card
      closeCard(ctx, copyID);
      // remove link
      removeLinkCard(ctx, cardID, attachmentID);

    });
  }
  catch (err) {
    console.error('could not complete workflow remove member for card ' + cardID);
    console.error(err);
  }
};


/****************************************\
 EXPRESS ENDPOINTS
\****************************************/

app.head('/', function(req, res) {
  console.log('trello.create_twin -- HEAD /');
  res.sendStatus(200);
});

app.post('/', function (req, res) {
  const ctx = req.webtaskContext;
  console.log('trello.create_twin -- POST /');

  // Main workflow code
  const body = req.body;
  const actionType = body.action.type;
  const memberID = body.action.data.idMember;
  const cardID = body.action.data.card.id;

  // Trigger:
  //   - new member : "addMemberToCard"
  //   - the member is the ctx.meta.ref_member_ID
  if (actionType === 'addMemberToCard' &&
      memberID === ctx.meta.ref_member_ID) {
    workflowOnAddMember(ctx, cardID);
  }

  // Trigger:
  //   - removed member : "removeMemberFromCard"
  //   - the member is the ctx.meta.ref_member_ID
  if (actionType === 'removeMemberFromCard' &&
      memberID === ctx.meta.ref_member_ID) {
    workflowOnRemoveMember(ctx, cardID);
  }


  res.sendStatus(200);
});

/****************************************\
 PUBLISH EXPRESS ENDPOINTS
\****************************************/
var Webtask = require('webtask-tools');
module.exports = Webtask.fromExpress(app);
