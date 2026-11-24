# FULLCHARGE → TestFlight from a Windows PC

The iOS build runs in Expo's cloud (EAS), so no Mac is needed. A TestFlight build is a
standalone app, so the Expo Go SDK version doesn't matter.

## Before you start
- **Apple Developer Program** membership ($99/yr), at developer.apple.com/programs.
  Approval can take a day or two.
- **Expo account** (free), at expo.dev/signup.
- **Node.js 20+ LTS**, from nodejs.org.

## Steps (PowerShell)

```powershell
cd C:\Users\vince\Desktop\fullcharge     # the folder where `dir` lists package.json
dir                                       # you must see package.json here

npm install
npm install -g eas-cli
eas login                                 # your Expo account

$env:EAS_NO_VCS = "1"                     # only if Git isn't installed; repeat in each new window
eas init                                  # creates the Expo project, writes its ID into app.json

npm run testflight                        # build in the cloud + upload to App Store Connect
```

`npm run testflight` asks a few questions. Answer them like this:
1. **Apple ID login**: sign in with your Apple Developer account.
2. **Generate a new Apple Distribution Certificate / Provisioning Profile?** Yes. EAS creates and stores them.
3. **Register bundle ID `com.fullcharge.rescue`?** Yes.
4. **Create the app in App Store Connect?** Yes. If the name "FULLCHARGE" is already taken,
   enter another one (e.g. "FULLCHARGE Rescue"). That name only appears in the store listing.

The cloud build takes about 15–30 min (longer if the free-tier queue is busy). EAS then uploads it to Apple.

## Install on your iPhone
1. Go to appstoreconnect.apple.com, then your app, then **TestFlight**. The build shows *Processing* for about 5–30 min.
2. Go to **Internal Testing**, press **+**, and add yourself (anyone on your App Store Connect team can be added; there's no Apple review).
3. On the iPhone, install **TestFlight** from the App Store, open the invite, and tap **Install**.

## What this build is
- **Mock mode** (`EXPO_PUBLIC_USE_MOCKS=true`, set in `eas.json`). It needs no backend. Camera ID returns the sample
  Model Y result, mock VINs work, the sign-in code is `123456`, and data-pack downloads are simulated.
- To ship a live build later, set the profile's `EXPO_PUBLIC_USE_MOCKS` to `"false"` and add
  `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in `eas.json`, then run `npm run testflight` again.
  The build number increases automatically.
- **External testers** (people outside your team) need Apple's beta review, about a day.

## If it fails
Copy the error from PowerShell, or the build log link from expo.dev, and paste it in.
