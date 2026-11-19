# C6: Channels → Website chat screen (UI catch-up block, R64)

**Where:** `/channels` ("Channels" in the sidebar). **Uses only existing routes:** `GET /channels/webchat` (everyone), `PATCH /channels/webchat` (managers).
**Status:** built 17 Nov 2026, waiting for the owner's check. Screenshots: `docs/features/C6-channels-website-chat/`.

## Feature guide

**What it does.** This is where a business puts the AI chat on its own website and decides how it looks. It has three parts.
1. **Put it on your website.** The one line of code to copy (with a **Copy the line** button and three plain steps), the list of **websites that may show the chat** (the chat only works on listed websites, so someone who copies your line onto another site gets nothing), and **Check the installation**, which says where and when the chat was last seen working, or tells you what to do if it has never been seen.
2. **How it looks.** Colour (a colour picker and a code like #1F6FEB), the greeting visitors see, which corner the bubble sits in, and a **live preview** that changes as you type.
3. **Buttons.** The bubble can show Chat, Call and WhatsApp. Choose which, put them in order, and give the phone and WhatsApp numbers (and an optional message ready-typed in WhatsApp). Call and WhatsApp stay hidden until their number is added, and the preview shows exactly which buttons will really appear.

**Why it helps.** This answers "where do I get the key and who installs it?": nobody at Toobler needs to. The line already contains the business's own key. The manager copies it (or sends it to whoever looks after their website), lists the website, and presses Check.

**A day in the life.** Anita opens Channels, copies the line and sends it to her web developer. She lists https://www.nairstays.in, picks the brand blue, writes "Welcome to Nair Stays! Ask me anything.", adds the hotel's phone and WhatsApp numbers, and puts Call first. The next afternoon she presses **Check again** and sees "Seen working on https://www.nairstays.in on 18 Nov 2026, 14:05."

**Who can do what.** Managers change everything. Other staff can see how the chat is set up (the fields are greyed and there are no buttons).

**Rules.** Only listed websites can show the chat (each website is tidied to its address, no page). Removing a website asks "Are you sure?" naming it. A number is read in the business's own country when typed without a country code. If the website chat is switched off for the business, the page says so (switch it on in Settings → Modules, built in C7). A business that has not **gone live** yet answers visitors with "We're not open for chat yet" (see the Setup guide).

**Never does.** It never shows the chat on a website that is not listed, and it never shows the Call or WhatsApp button without its number.

**Not part of it.** WhatsApp, email and phone channels (listed on the page as coming), a "generate a new key" button, and a place to see chats (the Inbox, F21).

## For the tech team
- Code: `apps/web/src/features/channels/`: pure logic with tests (`webchat-form.ts`: form ⇄ patch with only what changed, button order, website tidying, installation state), the screens (`ChannelsPage`, `WebchatInstallCard`, `WebchatLookCard`, `BubblePreview`) and `problem-message.ts`.
- Saved at once: the website list (each add or remove is its own `PATCH`). Saved on Save: the look and the buttons. The look card is rebuilt only when the saved settings really change, so a half-typed change is never lost.
- The copy button uses the browser's clipboard; if the browser refuses, the page says so and the line can be selected by hand.
- Tests: 13 unit tests; 34 browser tests at phone and desktop (`e2e/channels.spec.ts`, pretend API in `e2e/pretend-webchat.ts`) including copy, preview, validation, a refusal, off, staff and an accessibility check; the earlier screens' tests still pass.

## Manual test script (real app, manager login)
1. Open **Channels**. You see the line to paste, "No website listed yet" (or your list), and the look and buttons.
2. Press **Copy the line**, paste it somewhere to check it. Add your website (try `www.yoursite.in/page`: it becomes `https://www.yoursite.in`). Try "not a website": it says why.
3. Remove it: a box names it and asks "Are you sure?".
4. Change the greeting and colour: the preview changes at once. Save.
5. Tick the WhatsApp button: it says "Hidden until you add a number". Add a number: the preview shows it. Move Call above Chat. Save.
6. Clear the phone number and save: the Call button disappears from the preview.
7. In development, open `http://localhost:4000/widget/test?key=YOUR_KEY` (list `http://localhost:4000` first) to see the real bubble, then press **Check again**: it says where and when it was seen.
8. Sign in as staff: you can read it all and change nothing. Switch the website chat off in the API/Modules (C7): the page says it is switched off.

## Known limits / notes for the designer
- Designed by us in the Leads screens' style (flag in docs/FRONTEND.md §5). The preview is a drawing, not the real widget.
- There is no way yet to replace the widget key; a "new key" button is a small later addition.
