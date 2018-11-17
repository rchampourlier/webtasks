# webtasks

Using [webtask.io](https://webtask.io/make) and the code chunks in this repo (and a bit of work), you should be able to implement complex automation easily, as long as you now how to code a bit!

Think of IFTTT, Zapier, add your developer's skills and a bit of complexity, and you've got something that enables you to implement anything! You can do complex things with Zapier using their multi-step and filters workflow steps, but if you know how to code, at some point, you'll find it easier to just grab your code editor!

Webtask is handling the HTTP endpoint, the code execution, the secrets management, the scheduling, the logging... Isn't it nice? Not even a serverless function to deploy!

## Automate?

### `trello.copy_card`

A webtask exposing an endpoint to copy a Trello card.

### `trello.prm`

A more personal and complex workflow, updating the card's due date when adding a given label to the card. I use it to implement a CRM-like board on Trello, but you could use this as a base for your own personal workflow.

### `trello.sandbox`

A sandbox you can use to fetch you Trello boards, cards, lists IDs, setup webhooks, etc.

### `trello.gtd.scheduled`

Keeps the list named "Scheduled" of a Trello board sorted by due date (ascending). Useful to build a GTD board.

### `trello.sort_by_due`

Sorts the cards in a Trello list by due date, in ascending order. It exposes an endpoint so you should have a way to trigger it when you need the list sorted. I use the `trello.scheduled` webtask for this.

## How to use?

- Learn how [webtask.io](https://webtask.io/make) works
- Create a new webtask and copy-paste some of the code in this repo
- Enjoy!

## Troubleshooting

- I could not get to use the Webtask CLI, so I'm using the web editor only.
