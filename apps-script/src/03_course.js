/* Course content for the email journey. Copy lives here so it can be
   reviewed and changed without touching the workflow logic.
   Rules: Title Case subjects, a pain-point hook first, 50 to 60 words of body. */

var PLAYBOOK = 'https://archanacontent.github.io/b2b-saas/';

var TOPICS = {
  research: 'Market And Buyer Research',
  positioning: 'Positioning And Messaging',
  launch: 'Launch Planning And Content',
  sales: 'Sales Enablement And Performance'
};

/* Each lesson: label, subject, body, and CTA buttons tagged with a topic for interest scoring. */
var COURSE = [
  {
    step: 1, id: 'lesson-1', label: 'Welcome | Lesson 1 Of 5',
    subject: 'Lesson 1: Prove The Demand Before You Plan The Launch',
    body: [
      'Most stalled launches were planned around a problem nobody measured.',
      'Before you write a positioning line, find out how many companies feel the pain and what their current workaround costs them. The research module gives you a weighted scorecard, so the go or no-go call rests on evidence instead of instinct.'
    ],
    links: [
      { text: 'Read The Research Module', url: PLAYBOOK + 'market-research/', topic: 'research' },
      { text: 'Download The Launch Workbook', url: PLAYBOOK + 'templates/launch-playbook-workbook.xlsx', topic: 'launch' }
    ]
  },
  {
    step: 2, id: 'lesson-2', label: 'Lesson 2 Of 5',
    subject: 'Lesson 2: Name The Buyer Before You Write A Word',
    body: [
      'A launch aimed at every company reaches no one in particular.',
      'Sales chases accounts that will never buy, and the copy fits nobody on the buying committee. An ideal customer profile settles which companies to pursue. Personas show who signs the contract and who uses the product every day, and each needs a different reason to say yes.'
    ],
    links: [
      { text: 'Read The ICP And Personas Module', url: PLAYBOOK + 'icp-and-personas/', topic: 'research' },
      { text: 'Read The Competitive Intelligence Module', url: PLAYBOOK + 'competitive-intelligence/', topic: 'sales' }
    ]
  },
  {
    step: 3, id: 'lesson-3', label: 'Lesson 3 Of 5',
    subject: 'Lesson 3: Give Buyers One Reason To Choose You',
    body: [
      'If the website says one thing and the sales deck says another, buyers leave the first call knowing the category and little else.',
      'Positioning fixes the reason to buy before anyone writes copy. A message hierarchy then gives every team the same words, from the homepage hero to the renewal call.'
    ],
    links: [
      { text: 'Read The Positioning Module', url: PLAYBOOK + 'positioning-and-messaging/', topic: 'positioning' },
      { text: 'Download The Positioning Template', url: PLAYBOOK + 'templates/04-positioning-and-messaging.docx', topic: 'positioning' }
    ]
  },
  {
    step: 4, id: 'lesson-4', label: 'Lesson 4 Of 5',
    subject: 'Lesson 4: Plan The Launch And Build Every Asset From One Brief',
    body: [
      'Launch content usually gets written last and in a hurry, so the product page promises one outcome and the announcement leads with another.',
      'A go-to-market plan fixes who delivers what by which date. The content kit then builds every asset from the message hierarchy, and the buyer hears one promise everywhere.'
    ],
    links: [
      { text: 'Read The Go-To-Market Plan Module', url: PLAYBOOK + 'go-to-market-and-launch-plan/', topic: 'launch' },
      { text: 'Read The Launch Content Module', url: PLAYBOOK + 'launch-content-kit/', topic: 'launch' }
    ]
  },
  {
    step: 5, id: 'lesson-5', label: 'Final Lesson | 5 Of 5',
    subject: 'Lesson 5: Prepare Sales For Day One And Measure What Moved',
    body: [
      'A rep\'s first week with a new product decides how they sell it for the next year, and a recorded demo rarely covers it.',
      'The enablement module gives reps a deck outline and answers to the objections they will hear. Agree on targets before launch day, so the 90-day review measures real progress.'
    ],
    links: [
      { text: 'Read The Sales Enablement Module', url: PLAYBOOK + 'sales-enablement/', topic: 'sales' },
      { text: 'Read The Performance Module', url: PLAYBOOK + 'performance-and-optimisation/', topic: 'sales' }
    ]
  }
];

/* Workflow 10: next-best email, chosen by the subscriber's strongest topic. */
var NEXT_BEST = {
  research: {
    subject: 'Put Your Research To Work',
    body: ['Research that never reaches a campaign brief ends up in a folder nobody opens.', 'You spent most of the course on the research lessons, so the demand generation module is the natural next step. It shows how to aim campaigns at the accounts you scored highest and keep every message tied to your positioning.'],
    url: PLAYBOOK + 'demand-generation-support/', label: 'Read The Demand Generation Module'
  },
  positioning: {
    subject: 'Keep Your Positioning Intact At Launch',
    body: ['Positioning drifts the moment five people write launch assets from five different briefs.', 'You spent most of the course on positioning, so the launch content kit comes next. It shows how to build every launch asset from one message hierarchy, so the promise holds wherever a buyer happens to meet it.'],
    url: PLAYBOOK + 'launch-content-kit/', label: 'Read The Launch Content Module'
  },
  launch: {
    subject: 'Set The Targets Before Launch Day',
    body: ['A launch without agreed targets turns the 90-day review into a debate about what success meant.', 'You spent most of the course on launch planning, so the performance module is the next step. It helps you set targets with sales and product before launch day and feed the results back into the next plan.'],
    url: PLAYBOOK + 'performance-and-optimisation/', label: 'Read The Performance Module'
  },
  sales: {
    subject: 'See The Sales Deck Filled In',
    body: ['Reps struggle to picture a deck outline until they see one filled in for a worked example.', 'You spent most of the course on sales readiness, so the sample sales deck is the next step. It follows the enablement outline slide by slide, and you can download it as PowerPoint to adapt for your own product.'],
    url: PLAYBOOK + 'templates/sample-sales-deck.pdf', label: 'View The Sample Sales Deck'
  },
  none: {
    subject: 'Start With The Module Closest To Your Launch',
    body: ['A busy week can push a five-lesson course to the bottom of the inbox.', 'The playbook home page lists every module with a one-line summary, so you can pick up wherever your next launch needs help first. Each module links to blank templates you can download and fill in for your own product.'],
    url: PLAYBOOK, label: 'Open The Playbook'
  }
};

var REENGAGE = {
  subject: 'Should The Launch Course Emails Keep Coming?',
  body: ['An inbox full of emails you no longer read helps nobody, including the sender.', 'You have not opened a link from the last few emails, which is completely fine. If the launch course is still useful, tap the button and you will stay on the list. If not, do nothing and the emails will stop.'],
  label: 'Keep Me On The List'
};

var CONFIRM = {
  subject: 'Confirm Your Sign-Up For The Launch Course',
  reminderSubject: 'Your Launch Course Is Waiting For One Tap',
  hook: 'Course emails sent to an unchecked address end up in spam or nowhere at all, so one quick check comes first.',
  reminderHook: 'Your sign-up is still waiting, and the course cannot start until the address is confirmed.',
  body: 'Confirm your email with the button below and lesson one arrives straight away. Five lessons follow, one every two days. If you did not sign up, ignore this email and nothing else will arrive.',
  label: 'Confirm My Email'
};

var ENQUIRY_REPLY = {
  subject: 'Thanks For Your Message',
  body: ['A message sent through a portfolio site often disappears without a reply, so here is confirmation that yours has arrived.', 'I read every enquiry myself and will reply personally within two working days. Until then, the three samples below are the closest match to the work you described in your message.']
};
