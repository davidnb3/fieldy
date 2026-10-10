export function PrivacyPage({ navigate }) {
  return (
    <main className="page">
      <article className="shell page-narrow legal-copy">
        <h1>Privacy</h1>
        <p className="page-lead">
          Fieldy keeps your recordings on your computer. This page says what the app does with them, and
          what this website sees if you visit, download, or write to us.
        </p>
        <p className="legal-updated">25 September 2026</p>

        <section>
          <h2>The app</h2>
          <p>
            Fieldy is a desktop library. You choose a folder, and that folder is the library. Recordings
            stay there. The app does not upload them, and there is no account to send them to.
          </p>
          <p>
            Sorting happens on your computer. An AI model called YAMNet, run by TensorFlow, listens to a
            temporary copy in memory and picks a folder. Your original file is not sent anywhere for that.
          </p>
          <p>
            Settings, stars, and collections are stored on this computer, in the library folder and in a
            small local file that remembers which folder you picked. Quitting the app does not send that
            information to us.
          </p>
        </section>

        <section>
          <h2>This website</h2>
          <p>
            You can read the site without an account. We don’t add our own analytics or advertising. The
            pages are static. Whoever serves the site can see ordinary connection details, such as an IP
            address, the way any website does.
          </p>
          <p>
            The type on this site is loaded from Google Fonts. Your browser asks Google for those font
            files, so Google can see the usual connection details, including your IP address. The Fieldy
            app itself does not load these fonts.
          </p>
        </section>

        <section>
          <h2>Downloads</h2>
          <p>
            The Windows zip is a file on Cloudflare R2. When you download, your browser connects
            to Cloudflare to fetch the zip. Cloudflare can see the connection details needed to deliver
            it. The file is the app. It does not contain your recordings.
          </p>
        </section>

        <section>
          <h2>The contact form</h2>
          <p>
            If you write to us, the form sends your topic, name, email, and message to Web3Forms
            (web3forms.com). Web3Forms delivers that note to us by email. We use it to read what you sent
            and, if we can, to reply. We don’t add you to a mailing list, and we don’t sell the message.
          </p>
          <p>Don’t put anything in the form that you wouldn’t want in an email.</p>
        </section>

        <section>
          <h2>What we don’t do</h2>
          <p>
            There is no shop and no subscription. We don’t sell personal information. We don’t take the
            recordings in your library.
          </p>
        </section>

        <section>
          <h2>Your choices</h2>
          <p>
            You can delete the app and the library folder whenever you like. That removes Fieldy’s copy of
            what was stored there.
          </p>
          <p>
            If you wrote through the contact form and want that message corrected or deleted, use the same
            form and say so. You can also complain to a data protection authority where you live. Nothing
            on this page limits a right the law already gives you.
          </p>
        </section>

        <section>
          <h2>Changes</h2>
          <p>
            If this page changes, the date above changes with it. Questions go through the{" "}
            <a href="/contact" onClick={(event) => navigate(event, "/contact")}>
              contact form
            </a>.
          </p>
        </section>
      </article>
    </main>
  );
}

export function TermsPage({ navigate }) {
  return (
    <main className="page">
      <article className="shell page-narrow legal-copy">
        <h1>Terms</h1>
        <p className="page-lead">
          Fieldy is a free desktop library for your own recordings. These terms cover the website and the
          Windows download and the code on GitHub.
        </p>
        <p className="legal-updated">25 September 2026</p>

        <section>
          <h2>Using Fieldy</h2>
          <p>
            The app is free. There is no account and no subscription. You pick a folder on your computer,
            and that folder is the library. You choose whether a drop moves a file into that folder or
            copies it and leaves the original where it was.
          </p>
          <p>
            Fieldy organizes files. It does not replace the other apps you already use, and it does not
            give you recordings that aren’t yours.
          </p>
        </section>

        <section>
          <h2>Your files</h2>
          <p>
            You are responsible for the recordings you drop in, and for having the right to use them.
            Fieldy does not check who owns a file.
          </p>
          <p>
            A move takes the file from where it was. Undo lasts until you quit the app. Keep your own
            copy of anything you can’t replace.
          </p>
        </section>

        <section>
          <h2>Downloads</h2>
          <p>
            The download is 64-bit Windows. The source code is on GitHub.
          </p>
          <p>
            The Windows build is unsigned. Fieldy does not have a paid code-signing certificate, so
            SmartScreen may warn you before it opens the app. You decide whether to allow it. The file
            you download is the Fieldy build offered on this site.
          </p>
          <p>We can change a build, or stop offering one, without notice.</p>
        </section>

        <section>
          <h2>Offered as it is</h2>
          <p>
            Fieldy is a small free app. It is offered as it is. We don’t promise that every file will land
            in the folder you expected, or that a later version will work the same way.
          </p>
          <p>
            To the extent the law allows, we aren’t liable for lost files, lost work, or a warning from
            your operating system about an unsigned app. Nothing here removes liability the law says we
            can’t set aside.
          </p>
        </section>

        <section>
          <h2>This website</h2>
          <p>
            The Fieldy name, logo, and the text on this site are ours. Don’t present a copy of the site or
            the app as a different product.
          </p>
        </section>

        <section>
          <h2>Changes</h2>
          <p>
            These terms can change. The date at the top is the latest version. Using the site or a
            download after that date means you accept the version then on the page. Questions go through
            the{" "}
            <a href="/contact" onClick={(event) => navigate(event, "/contact")}>
              contact form
            </a>.
          </p>
        </section>
      </article>
    </main>
  );
}
