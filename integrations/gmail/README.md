# Automatic board emails through your Gmail account

This replaces the shared activity database with background email notifications. The website can stay on GitHub Pages, and your domain can keep DanDomain DNS-only hosting. Google hosts the small receiver script. No Gmail password, OAuth token, or recipient address is embedded in the public app.

For each successfully recognized screenshot import, the app dispatches one board representation in the background. Users do not see an email window, Google login, permission prompt, toast, or extra button. Import and solving continue without waiting for email delivery. Crop adjustments and calculations do not send additional messages. A short data-use explanation remains in Help.

The email includes an anonymous browser ID, timestamp, a 15×15 text grid, rack letters, and a `board.json` attachment containing letters, tile values, blanks, bonuses, and scoring rules. No image, image URL, or original filename is sent. The browser ID identifies an installation, not a named person. Email mode does not collect app-open logs or populate the hidden Users database.

## One-time setup in your Google account

1. Sign in to the Gmail account that should send the messages and open https://script.google.com/ . Create a new project called **WordWin board emails**.
2. Replace the contents of `Code.gs` with this folder's entire `Code.gs` file.
3. Near the top of the code, replace `YOUR_ADDRESS@gmail.com` with the Gmail address that should receive the messages. This address is configured only in your private Apps Script project.
4. Save. Select **configureWordWin** in the function dropdown and click **Run**. Authorize Google to send email. This function saves the fixed recipient and checks the sending quota; it does not send a test email or read your inbox. Optionally enable “Show appsscript.json manifest file” in Project Settings and use the provided manifest to explicitly request only the send-email permission.
5. Choose **Deploy → New deployment → Web app**. Set **Execute as: Me** and **Who has access: Anyone**, so app users do not need a Google account. Deploy and copy the URL ending in `/exec` (not `/dev`). If your Google Workspace administrator prevents public deployments, this option will not work with that account.
6. In the **mathiaskrois/krois-site** GitHub repository, open **Settings → Secrets and variables → Actions → Variables → New repository variable**. Name it `WORDWIN_BOARD_EMAIL_URL` and paste the `/exec` URL. It is a public endpoint URL, not a password.
7. Publish the updated WordWin source, wait for its verification workflow, update only WordWin's commit in `krois-site/releases.json`, and run the site deployment. Its WordWin build step passes that repository variable into `VITE_BOARD_EMAIL_URL`.
8. Import a board on the published site and check Gmail, including spam. The received message should include a text grid and a JSON attachment. Check **Executions** in Apps Script if no message arrives.

For a local email-enabled build:

```sh
VITE_BOARD_EMAIL_URL='https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec' npm run build
```

After editing your Apps Script code, use **Deploy → Manage deployments → Edit → New version → Deploy** so the existing `/exec` URL serves the change. Running a function in the editor alone does not update a deployed version.

## Delivery limits

This is best-effort email, not a guaranteed audit trail. Apps Script has daily mail quotas (currently 100 recipient deliveries per day for consumer accounts; other scripts using the account share that quota). The supplied script also caps notifications at 100/day and 20/day per browser ID, always to the fixed configured recipient. It validates board-only payloads, ignores duplicate IDs among the last 100 successful sends within seven days, and stores only those IDs and counters in Script Properties, not board content. IDs are anonymous and can be forged; the public URL cannot fully prevent someone from using up the notification quota.

The browser keeps up to 250 pending imports while offline and retries when it reconnects, resumes, or imports another board. Google Apps Script responses can be opaque across origins, so the app uses a simple `text/plain` POST in `no-cors` mode and cannot verify the server's response or final email delivery. A dispatched request is removed from the queue; quota failures, configuration errors and provider failures may therefore lose a notification. Network failures retain the item for retry. The server ignores recent duplicate IDs, but a failure between sending and recording the ID can still create a duplicate. Use the authenticated database backend if guaranteed confirmation and a queryable history are required.

Google references: https://developers.google.com/apps-script/guides/web , https://developers.google.com/apps-script/reference/mail/mail-app , https://developers.google.com/apps-script/guides/services/quotas .
