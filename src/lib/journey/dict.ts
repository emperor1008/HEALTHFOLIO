/**
 * Journey status translations (en/hi/or). Keys come from `deriveJourney`;
 * explanations are plain language, safe, and never expose internal rule
 * names or audit details.
 */

import type { Language } from "@/lib/i18n";

export interface JourneyDict {
  title: string;
  steps: Record<string, { label: string; hint: string }>;
  stateDone: string;
  stateCurrent: string;
  stateWaiting: string;
  stateAttention: string;
  stateNotStarted: string;
  retry: string;
  viewDetails: string;
  liveRegionIntro: string;
}

const en: JourneyDict = {
  title: "Your request journey",
  steps: {
    captured: {
      label: "Record captured or request started",
      hint: "You started this request on your device.",
    },
    saved_device: {
      label: "Saved on this device",
      hint: "Saved securely on your phone. It will send when a connection is available.",
    },
    synced: {
      label: "Synchronized securely",
      hint: "Your information reached the health service securely.",
    },
    submitted: {
      label: "Care request submitted",
      hint: "Your care request is with the health service.",
    },
    routed: {
      label: "Safety routing complete",
      hint: "A safety check sorted your request so the right care team can see it. This check does not diagnose.",
    },
    awaiting_review: {
      label: "Awaiting care team review",
      hint: "Waiting for a care team to review your request.",
    },
    clinician_action: {
      label: "Care team action",
      hint: "A care team member has acted on your request.",
    },
    appointment: {
      label: "Appointment or secure message",
      hint: "Your appointment or secure message status is shown here.",
    },
    consent: {
      label: "Record sharing",
      hint: "You decide which records to share, and you can stop sharing before the consultation.",
    },
    pharmacy: {
      label: "Medicine availability",
      hint: "Availability comes from the pharmacy's own last confirmation.",
    },
    completed: {
      label: "Completed",
      hint: "This request is complete.",
    },
    in_progress: {
      label: "In progress",
      hint: "Your request is moving forward.",
    },
    needs_attention: {
      label: "Needs your attention",
      hint: "Something needs your attention. You can retry or view details below.",
    },
  },
  stateDone: "Done",
  stateCurrent: "Now",
  stateWaiting: "Waiting",
  stateAttention: "Needs attention",
  stateNotStarted: "Not started",
  retry: "Retry",
  viewDetails: "View details",
  liveRegionIntro: "Journey status",
};

const hi: JourneyDict = {
  title: "आपके अनुरोध की यात्रा",
  steps: {
    captured: {
      label: "रिकॉर्ड जोड़ा या अनुरोध शुरू किया",
      hint: "आपने यह अनुरोध अपने डिवाइस पर शुरू किया।",
    },
    saved_device: {
      label: "इस डिवाइस पर सुरक्षित",
      hint: "आपके फ़ोन पर सुरक्षित सहेजा गया। कनेक्शन मिलने पर भेजा जाएगा।",
    },
    synced: {
      label: "सुरक्षित रूप से सिंक हुआ",
      hint: "आपकी जानकारी सुरक्षित रूप से स्वास्थ्य सेवा तक पहुँच गई।",
    },
    submitted: {
      label: "देखभाल अनुरोध भेजा गया",
      hint: "आपका अनुरोध स्वास्थ्य सेवा के पास है।",
    },
    routed: {
      label: "सुरक्षा जाँच पूरी",
      hint: "सुरक्षा जाँच ने आपका अनुरोध सही टीम तक पहुँचाया। यह जाँच निदान नहीं करती।",
    },
    awaiting_review: {
      label: "टीम की समीक्षा की प्रतीक्षा",
      hint: "देखभाल टीम के आपका अनुरोध देखने की प्रतीक्षा है।",
    },
    clinician_action: {
      label: "टीम की कार्रवाई",
      hint: "देखभाल टीम के सदस्य ने आपके अनुरोध पर कार्रवाई की है।",
    },
    appointment: {
      label: "अपॉइंटमेंट या सुरक्षित संदेश",
      hint: "आपके अपॉइंटमेंट या संदेश की स्थिति यहाँ दिखती है।",
    },
    consent: {
      label: "रिकॉर्ड साझा करना",
      hint: "आप तय करते हैं कि कौन से रिकॉर्ड साझा करने हैं, और परामर्श से पहले रोक सकते हैं।",
    },
    pharmacy: {
      label: "दवा की उपलब्धता",
      hint: "उपलब्धता फार्मेसी की आख़िरी पुष्टि से आती है।",
    },
    completed: {
      label: "पूर्ण",
      hint: "यह अनुरोध पूरा हुआ।",
    },
    in_progress: {
      label: "प्रगति पर",
      hint: "आपका अनुरोध आगे बढ़ रहा है।",
    },
    needs_attention: {
      label: "आपके ध्यान की ज़रूरत",
      hint: "कुछ पर ध्यान देने की ज़रूरत है। नीचे पुनः प्रयास करें या विवरण देखें।",
    },
  },
  stateDone: "पूर्ण",
  stateCurrent: "अभी",
  stateWaiting: "प्रतीक्षा",
  stateAttention: "ध्यान दें",
  stateNotStarted: "शुरू नहीं",
  retry: "पुनः प्रयास",
  viewDetails: "विवरण देखें",
  liveRegionIntro: "यात्रा की स्थिति",
};

const or: JourneyDict = {
  title: "ଆପଣଙ୍କ ଅନୁରୋଧର ଯାତ୍ରା",
  steps: {
    captured: {
      label: "ରେକର୍ଡ ଯୋଗ କରାଗଲା ବା ଅନୁରୋଧ ଆରମ୍ଭ",
      hint: "ଆପଣ ଏହି ଅନୁରୋଧ ନିଜ ଡିଭାଇସରେ ଆରମ୍ଭ କରିଛନ୍ତି।",
    },
    saved_device: {
      label: "ଏହି ଡିଭାଇସରେ ସୁରକ୍ଷିତ",
      hint: "ଆପଣଙ୍କ ଫୋନରେ ସୁରକ୍ଷିତ ଭାବରେ ସଂରକ୍ଷିତ। ସଂଯୋଗ ମିଳିଲେ ପଠାଯିବ।",
    },
    synced: {
      label: "ସୁରକ୍ଷିତ ଭାବରେ ସିଙ୍କ ହେଲା",
      hint: "ଆପଣଙ୍କ ସୂଚନା ସୁରକ୍ଷିତ ଭାବରେ ସ୍ୱାସ୍ଥ୍ୟ ସେବା ପାଖରେ ପହଞ୍ଚିଗଲା।",
    },
    submitted: {
      label: "ଯତ୍ନ ଅନୁରୋଧ ପଠାଗଲା",
      hint: "ଆପଣଙ୍କ ଅନୁରୋଧ ସ୍ୱାସ୍ଥ୍ୟ ସେବା ପାଖରେ ଅଛି।",
    },
    routed: {
      label: "ସୁରକ୍ଷା ଯାଞ୍ଚ ସମ୍ପୂର୍ଣ୍ଣ",
      hint: "ସୁରକ୍ଷା ଯାଞ୍ଚ ଆପଣଙ୍କ ଅନୁରୋଧ ସଠିକ୍ ଟିମ୍ ପାଖକୁ ପହଞ୍ଚାଇଲା। ଏହି ଯାଞ୍ଚ ରୋଗ ନିର୍ଣ୍ଣୟ କରେ ନାହିଁ।",
    },
    awaiting_review: {
      label: "ଟିମ୍‌ଙ୍କ ସମୀକ୍ଷା ପାଇଁ ଅପେକ୍ଷା",
      hint: "ଯତ୍ନ ଟିମ୍‌ଙ୍କ ଆପଣଙ୍କ ଅନୁରୋଧ ଦେଖିବା ପାଇଁ ଅପେକ୍ଷା।",
    },
    clinician_action: {
      label: "ଟିମ୍‌ଙ୍କ କାର୍ଯ୍ୟାନୁଷ୍ଠାନ",
      hint: "ଯତ୍ନ ଟିମ୍‌ର ସଦସ୍ୟ ଆପଣଙ୍କ ଅନୁରୋଧ ଉପରେ କାର୍ଯ୍ୟ କରିଛନ୍ତି।",
    },
    appointment: {
      label: "ଅପଏଣ୍ଟମେଣ୍ଟ ବା ସୁରକ୍ଷିତ ମେସେଜ୍",
      hint: "ଆପଣଙ୍କ ଅପଏଣ୍ଟମେଣ୍ଟ ବା ମେସେଜ୍‌ର ଅବସ୍ଥା ଏଠାରେ ଦେଖାଯାଏ।",
    },
    consent: {
      label: "ରେକର୍ଡ ସହଭାଗ",
      hint: "କେଉଁ ରେକର୍ଡ ସହଭାଗ କରିବେ ତାହା ଆପଣ ସ୍ଥିର କରନ୍ତି, ପରାମର୍ଶ ପୂର୍ବରୁ ବନ୍ଦ ମଧ୍ୟ କରିପାରିବେ।",
    },
    pharmacy: {
      label: "ଔଷଧ ଉପଲବ୍ଧତା",
      hint: "ଉପଲବ୍ଧତା ଫାର୍ମେସୀର ଶେଷ ନିଶ୍ଚିତତାରୁ ଆସେ।",
    },
    completed: {
      label: "ସମ୍ପୂର୍ଣ୍ଣ",
      hint: "ଏହି ଅନୁରୋଧ ସମ୍ପୂର୍ଣ୍ଣ ହୋଇଗଲା।",
    },
    in_progress: {
      label: "ଚାଲିଛି",
      hint: "ଆପଣଙ୍କ ଅନୁରୋଧ ଆଗକୁ ବଢ଼ୁଛି।",
    },
    needs_attention: {
      label: "ଆପଣଙ୍କ ଧ୍ୟାନ ଦରକାର",
      hint: "କିଛି ଉପରେ ଧ୍ୟାନ ଦେବା ଦରକାର। ତଳେ ପୁଣି ଚେଷ୍ଟା କରନ୍ତୁ ବା ବିବରଣୀ ଦେଖନ୍ତୁ।",
    },
  },
  stateDone: "ସମ୍ପୂର୍ଣ୍ଣ",
  stateCurrent: "ଏବେ",
  stateWaiting: "ଅପେକ୍ଷା",
  stateAttention: "ଧ୍ୟାନ ଦିଅନ୍ତୁ",
  stateNotStarted: "ଆରମ୍ଭ ହୋଇନାହିଁ",
  retry: "ପୁଣି ଚେଷ୍ଟା",
  viewDetails: "ବିବରଣୀ ଦେଖନ୍ତୁ",
  liveRegionIntro: "ଯାତ୍ରାର ସ୍ଥିତି",
};

const JOURNEY_DICTS: Record<Language, JourneyDict> = { en, hi, or };

export function getJourneyDict(language: Language): JourneyDict {
  return JOURNEY_DICTS[language] ?? en;
}
