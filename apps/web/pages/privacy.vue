<template>
  <div>
    <SiteHeader />
    <main id="main" class="shell prose-page">
      <h1>Your files,<br />your choice.</h1>
      <h2>Browser toolbox</h2>
      <p>
        Image, audio, video, PDF, archive, text and checksum processing happen
        on your device, including inside the Discord Activity. MPEG-V does not
        upload your files for these conversions. Results stay in the page until
        you download them, replace them or leave. There is no automatic server
        fallback.
      </p>
      <p>
        Media and PDF tools download their processing software from this site
        when first needed. This downloads software to your device; it does not
        send your media anywhere. Your browser may cache the engine for later
        use.
      </p>
      <p>
        Extracted archive files are offered as downloads without opening their
        contents. Original files are never overwritten. Checksum reports contain
        the selected filenames and hashes and stay on your device.
      </p>
      <h2>Discord bot</h2>
      <p>
        The bot processes Discord attachments on its server. Media uses temporary
        files; PDF, archive and text tools work in memory. Temporary
        input files are deleted when processing finishes, fails or is cancelled
        during normal operation. A server crash can leave temporary files for
        the host to clean up. Output is returned to you, with no permanent file
        library in MPEG-V.
      </p>
      <p>
        File commands reply privately unless you choose a public result. A
        private reply does not hide an original attachment already posted in a
        channel. Passing a result between browser tools keeps it on your device.
      </p>
      <h2>Sharing and Discord</h2>
      <p>
        Choosing Share in Discord uploads the converted output to Discord and
        opens a dialog so you can choose its destination. Files already uploaded
        to Discord, including bot replies, are subject to Discord's retention
        and privacy policies.
      </p>
      <h2>Conversion records</h2>
      <p>
        When production logging is enabled, the original audio-to-video commands record the filename,
        format, sizes, duration, conversion time, user ID and server ID. These
        records do not contain the audio or video itself. The browser toolbox
        and the new file commands do not create conversion records.
      </p>
      <h2>Discord sign-in</h2>
      <p>
        The Activity requests your basic Discord identity and server membership
        to authorize sharing and account or server preferences. Server membership
        and permissions are checked when accessing server settings.
        Conversion does not require sign-in. Its access token is held in page
        memory, not browser storage, and is cleared when you leave the page. The
        service validates that the token belongs to this application before
        accepting work.
      </p>
      <h2>Saved preferences</h2>
      <p>
        Choosing Save defaults for this device stores your selected appearance
        options in this browser. It stores no files or account identifiers. Reset
        saved defaults removes these options.
      </p>
      <p>
        Saving Discord account or server defaults stores the corresponding
        Discord ID, your chosen settings and an edit revision in MPEG-V's
        database. It does not store your files or access token. Personal settings
        belong to you; changing server defaults requires Manage Server permission.
        Resetting all defaults removes that settings record. Backups may retain
        earlier records until the host's backups expire.
      </p>
      <p><NuxtLink to="/workspace">Back to the toolbox →</NuxtLink></p>
    </main>
  </div>
</template>
