## Purpose

Makes every click, fill, and select act on exactly the element Jev chose, even when several controls share a name, and makes non-semantic clickable elements visible to Jev.

## ADDED Requirements

### Requirement: Locators pinned to the chosen element
When Cordy observes a page, it SHALL check each element's first locator candidate against the page. When that locator matches more than one element, the candidate MUST carry the zero-based position `nth` of the observed element among the matches, in the order Playwright returns them. When executing, Cordy SHALL apply `nth` to the locator, and generated code SHALL render it as `.nth(<n>)`. Candidates that match exactly one element MUST NOT carry `nth`.

#### Scenario: Repeated link
- **WHEN** a page has four visible links named `Cotiza tu envío` and Jev picks the third one for a click step
- **THEN** the click uses `getByRole('link', { name: 'Cotiza tu envío' }).nth(2)` and succeeds
- **AND** the generated test contains `.getByRole("link", { name: "Cotiza tu envío" }).nth(2)`

#### Scenario: Name contained in another name
- **WHEN** a page has buttons named `Simular` and `Simular de nuevo`, and Jev picks `Simular`
- **THEN** the locator carries the position of `Simular` among both matches, and the click acts on `Simular`

#### Scenario: Unique control
- **WHEN** only one element matches the chosen control's locator
- **THEN** the locator has no `nth`, and generated code has no `.nth(...)`

#### Scenario: Unique selector preferred
- **WHEN** an element has an `id` or a `data-event` attribute
- **THEN** its first candidate stays the unique selector, and no position is added

### Requirement: Clickable elements beyond semantic controls
Besides form fields, buttons, and links with `href`, observation SHALL include visible elements with role `tab`, `menuitem`, `menuitemcheckbox`, `menuitemradio`, `option`, or `switch`, `<summary>` elements, `<a>` elements without `href`, elements with an `onclick` attribute, and elements whose computed cursor is `pointer` when their parent's is not. A `cursor: pointer` element SHALL be included only when its visible text has 1 to 80 characters and it neither contains nor is contained in another observed element. Elements with an explicit ARIA role keep it. The others SHALL have role `clickable`, the first non-empty line of their visible text (whitespace collapsed) as name, and a `getByText` candidate for that line (pinned with `nth` like any other). Jev MAY propose `click` on a `clickable` element, and MUST NOT propose fill, select, or check on one.

#### Scenario: Clickable card
- **WHEN** a page shows a `<div>` with `cursor: pointer` and the text `Envío express`, and a step says `clic en "Envío express"`
- **THEN** the div is observed with role `clickable` and name `Envío express`, and Jev can click it

#### Scenario: Card with several lines
- **WHEN** a `cursor: pointer` card has the heading `Envío express` and the line `Llega mañana`
- **THEN** its name is `Envío express`, and its `getByText('Envío express')` candidate clicks the card

#### Scenario: Button inside a card
- **WHEN** a `cursor: pointer` card contains a `<button>` named `Ver más`
- **THEN** only the button is observed, not the card

#### Scenario: Tab
- **WHEN** a page has `<div role="tab">Paquetería</div>`
- **THEN** it is observed with role `tab` and a `getByRole('tab', { name: 'Paquetería' })` candidate

#### Scenario: Fill on a clickable
- **WHEN** Jev proposes `fill` on an element with role `clickable`
- **THEN** Cordy returns `needs_review`
