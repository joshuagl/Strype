<img src="public/favicon.png" width="64" align="left">

# Strype

Strype is a frame-based editor for Python that runs entirely in the browser, designed for use in secondary schools.  You can learn more and use the free public release at <a href="https://strype.org/" target="_blank">strype.org</a>. 

Strype is maintained by Michael Kölling and the K-PET group at King's College London, alongside their other tools, BlueJ and Greenfoot.

License
---

This repository contains the source code for Strype, licensed under the AGPLv3 (see [LICENSE.txt](LICENSE.txt)).  You can use and modify the code according to that license, but be aware that the Strype name, logo, and other visual assets belong to the Strype team.

Building and running
---

Strype is a <a href="https://vuejs.org/" target="_blank">Vue</a> project that uses NPM as its core tool.  To build you will first need to install <a href="https://nodejs.org/en" target="_blank">Node.js</a> (or <a href="https://docs.npmjs.com/downloading-and-installing-node-js-and-npm" target="_blank">another method</a>) to get NPM.

Then, to run a local test version you can run the following commands in the top level of the checked out repository:

```
npm install
npm run build:download-pyodide-libs
npm run serve:python
```

If you want to create a packaged version to distribute or host somewhere, instead run:

```
npm ci
npm run build:download-pyodide-libs
npm run build:python
```

Strype is currently an entirely client-side tool; there is no server component to run alongside.

Releasing
---

Publishing a GitHub Release (Releases -> Draft a new release, pick or create a tag, then Publish) automatically
triggers the `attach-release-build.yml` workflow, which builds packaged versions for the Python and micro:bit
platforms and attaches them to that release as zip files, so anyone can download a ready-to-host copy without
needing to build it themselves.

Development
---

To work on the project, you can use a variety of tools: our team members use <a href="https://code.visualstudio.com/" target="_blank">VS Code</a> or <a href="https://www.jetbrains.com/webstorm/" target="_blank">Webstorm</a>.  To run the full test suite (which takes 2+ hours) you can run:

```
npm run test:cypress
npm run test:playwright
```

To speed up the Cypress tests locally, we can target specific tests by setting an environment variable, e.g. this would work on Mac and Linux
```
SPEC="autocomplete.cy.ts" npm run:test:cypress
```

This item can have wildcards, e.g.

```
SPEC="**/autocomplete*.cy.ts" npm run:test:cypress
```

You can also change the relevant ```describe``` function call in the test file into ```describe.only``` to only run that test in the file. Be aware that it will silently turns off all the other tests!  **Do not commit this change!**

To run a specific Playwright test, you can do the same with SPEC, e.g. this would work on Mac and Linux:
```
SPEC="graphics.spec.ts" npm run test:playwright 
```

The tests and linter are run automatically in Github actions and they should always pass before changes are merged in.  You can run the linter manually with:

```
npm run lint:check
```


Contributing
---

We readily accept pull requests for translations or bug fixes.  If you plan to add an entirely new feature or noticeably change existing behaviour we advise you to get in contact with us first, as we are likely to refuse any pull requests which are not part of our plan for Strype.  Our experience is that one of the important features for novice tools is their simplicity, which is achieved by being very conservative in which features we choose to add.

Current team:
- Neil Brown (King's College London)
- Michael Kölling (King's College London)
- Pierre Weill-Tessier (King's College London)

Other contributors:
- Clemens Bachmann and Dennis Komm (Turtle implementation, from WebTigerPython)
- Tobias Kohn (<a href="https://github.com/Tobias-Kohn/TigerPython-Parser" target="_blank">TigerPython parser</a>)
- Babis Kyfonidis
- Zak Singh
- Aleksandr Voronstov

Translators:
- Chinese: Rongkun Liu
- French: Pierre Weill-Tessier
- German: Michael Kölling
- Greek: Babis Kyfonidis
- Spanish: Emma Dodoo and Nolgie Oquendo-Colon

Roadmap
---

Strype is currently under very active development.  A rough roadmap of some major planned features (beyond the general bugfixing and polishing):

 - ~Add class frames (for object-oriented programming): Q4 2025~ (Done)
 - ~Add support for loading/saving Strype projects from/to OneDrive: Q4 2025~ (Done)
 - ~Provide a translation helper tool for localisation: Q4 2025~ (Done)
 - ~Internal backend update for Strype's Python emulation: Q1 2026~ (Done)
 - ~Internal update to Vue 3: Q1 2026~ (Done)
 - Add support for data processing and/or charting: Q2 2026 (In progress)
 - Extent the micro:bit simulator's features: Q3 2026

The dates and choices may change as we receive more user feedback.
