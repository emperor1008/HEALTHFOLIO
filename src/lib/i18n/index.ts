/**
 * Lightweight dictionary-based i18n for Part 1 (works fully offline).
 *
 * English is the source of truth. `hi` and `or` are complete for every
 * Part-1 UI key; missing keys fall back to English. Medical record content
 * is never translated — only fixed interface strings.
 */

export const LANGUAGES = ["en", "hi", "or"] as const;
export type Language = (typeof LANGUAGES)[number];

export const LANGUAGE_LABELS: Record<Language, string> = {
  en: "English",
  hi: "हिन्दी",
  or: "ଓଡ଼ିଆ",
};

export const DEFAULT_LANGUAGE: Language = "en";

export function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && (LANGUAGES as readonly string[]).includes(value);
}

function normalizeLocaleTag(tag: string): Language | null {
  const base = tag.toLowerCase().split("-")[0];
  if (base === "en") return "en";
  if (base === "hi") return "hi";
  // Odia also appears as "ory" in some Android locales
  if (base === "or" || base === "ory") return "or";
  return null;
}

export function resolveLanguage(candidate: unknown): Language {
  if (typeof candidate === "string" && candidate) {
    const normalized = normalizeLocaleTag(candidate);
    if (normalized) return normalized;
  }
  return DEFAULT_LANGUAGE;
}

// ─── Dictionary type: keys shared across all languages ─────────────────────

export interface Dict {
  // App / home
  appName: string;
  welcome: string;
  welcomeOfflineHint: string;
  recordsShortcut: string;
  careRequestsShortcut: string;
  noRecordsYet: string;
  noRecordsYetHint: string;
  needsYourAttention: string;

  // Connection / sync states
  online: string;
  offline: string;
  syncStateAllSynced: string;
  syncStateAllSyncedHint: string;
  syncStateOfflinePending: string;
  syncStateOfflinePendingHint: string;
  syncStateSyncing: string;
  syncStateSyncingHint: string;
  syncStateNeedsAttention: string;
  syncStateNeedsAttentionHint: string;
  syncNow: string;
  syncingNow: string;
  syncStartedAnnouncement: string;
  syncCompletedAnnouncement: string;
  syncFailedAnnouncement: string;
  itemsWaiting: string;
  oneItemWaiting: string;
  itemsFailed: string;
  oneItemFailed: string;
  viewDetails: string;
  retryItem: string;
  removeDraft: string;
  removeDraftConfirmTitle: string;
  removeDraftConfirmBody: string;
  removeDraftConfirmYes: string;
  removeDraftConfirmNo: string;

  // Capture
  takePhoto: string;
  uploadFile: string;
  savedOnDevice: string;
  savedOnDeviceHint: string;
  saveForLater: string;
  uploadFailedSavedQueued: string;
  photoLabel: string;
  fileLabel: string;

  // Care request
  careRequestTitle: string;
  careRequestIntro: string;
  notMedicalAdvice: string;
  emergencyNotice: string;
  reasonLabel: string;
  reasonPlaceholder: string;
  contactMethodLabel: string;
  contactInApp: string;
  contactPhone: string;
  contactEmail: string;
  languageLabel: string;
  saveCareRequest: string;
  savingCareRequest: string;
  careRequestSavedOffline: string;
  careRequestSavedOnline: string;
  careRequestFailed: string;
  requiredReason: string;
  emergencyDetected: string;
  linkedRecordsLabel: string;
  linkedRecordsHint: string;
  myCareRequests: string;
  noCareRequestsYet: string;
  noCareRequestsYetHint: string;
  statusDraft: string;
  statusSubmitted: string;
  statusProcessing: string;
  statusCompleted: string;

  // Settings
  settingsTitle: string;
  languageSettings: string;
  languageSettingsHint: string;
  languageSyncNote: string;
  cancel: string;
}

const en: Dict = {
  appName: "Healthfolio",
  welcome: "Welcome to your health space",
  welcomeOfflineHint:
    "You can keep adding records and care requests. They stay safely on this device until a connection is available.",
  recordsShortcut: "My records",
  careRequestsShortcut: "Care requests",
  noRecordsYet: "Keep your health records together. Add your first record when you are ready.",
  noRecordsYetHint: "Reports, prescriptions and scans all belong in one safe place.",
  needsYourAttention: "Needs your attention",

  online: "You are online",
  offline: "You are offline",
  syncStateAllSynced: "Synced securely",
  syncStateAllSyncedHint: "Everything you saved is safely backed up.",
  syncStateOfflinePending: "Saved on this device",
  syncStateOfflinePendingHint: "Saved items will upload automatically when a connection is available.",
  syncStateSyncing: "Syncing your saved items",
  syncStateSyncingHint: "This may take a moment on a slow connection.",
  syncStateNeedsAttention: "Some items need attention",
  syncStateNeedsAttentionHint: "A saved item could not be delivered. You can retry it below.",
  syncNow: "Sync now",
  syncingNow: "Syncing…",
  syncStartedAnnouncement: "Sync started.",
  syncCompletedAnnouncement: "Sync finished. All saved items are up to date.",
  syncFailedAnnouncement: "Some saved items could not be delivered. They are kept safe on this device.",
  itemsWaiting: "{count} items waiting for connection",
  oneItemWaiting: "1 item waiting for connection",
  itemsFailed: "{count} items need attention",
  oneItemFailed: "1 item needs attention",
  viewDetails: "View details",
  retryItem: "Retry",
  removeDraft: "Remove local draft",
  removeDraftConfirmTitle: "Remove this saved item?",
  removeDraftConfirmBody:
    "It will be deleted from this device only. Records already delivered to your health space are not affected.",
  removeDraftConfirmYes: "Yes, remove it",
  removeDraftConfirmNo: "Keep it",  takePhoto: "Take a photo of a record",
  uploadFile: "Upload a file",
  savedOnDevice: "Saved on this device. It will upload automatically when a connection is available.",
  savedOnDeviceHint: "Offline capture",
  saveForLater: "Save on this device",
  uploadFailedSavedQueued: "The connection dropped. Your record is saved on this device and will upload automatically.",
  photoLabel: "Photo of a medical record",
  fileLabel: "Medical record file",

  careRequestTitle: "Request care support",
  careRequestIntro:
    "Tell us briefly why you are requesting care. This becomes a note in your health space.",
  notMedicalAdvice: "This request is not medical advice or emergency care.",
  emergencyNotice:
    "For severe or life-threatening symptoms, contact local emergency services or go to the nearest emergency facility now.",
  reasonLabel: "Short reason for requesting care",
  reasonPlaceholder: "For example: I need help understanding my latest report",
  contactMethodLabel: "Preferred contact method",
  contactInApp: "In this app",
  contactPhone: "Phone",
  contactEmail: "Email",
  languageLabel: "Language",
  saveCareRequest: "Save request",
  savingCareRequest: "Saving…",
  careRequestSavedOffline: "Saved on this device. It will send automatically when a connection is available.",
  careRequestSavedOnline: "Request saved securely.",
  careRequestFailed: "We could not save this request. Your words are kept safe on this device.",
  requiredReason: "Please write a short reason first.",
  emergencyDetected: "If this is an emergency, please seek help now:",
  linkedRecordsLabel: "Attach a saved record (optional)",
  linkedRecordsHint: "Choose from records saved on this device.",
  myCareRequests: "My care requests",
  noCareRequestsYet: "No care requests yet.",
  noCareRequestsYetHint: "When you save one, it will appear here with its delivery status.",
  statusDraft: "Saved on this device",
  statusSubmitted: "Delivered securely",
  statusProcessing: "Being processed",
  statusCompleted: "Completed",

  settingsTitle: "Settings",
  languageSettings: "Language",
  languageSettingsHint: "Choose the language for app screens.",
  languageSyncNote: "Your language choice is saved on this device and synced when a connection is available.",
  cancel: "Cancel",
};

const hi: Dict = {
  appName: "हेल्थफ़ोलियो",
  welcome: "आपके स्वास्थ्य स्थान में आपका स्वागत है",
  welcomeOfflineHint:
    "आप रिकॉर्ड और देखभाल अनुरोध जोड़ते रह सकते हैं। वे कनेक्शन मिलने तक इस डिवाइस पर सुरक्षित रहेंगे।",
  recordsShortcut: "मेरे रिकॉर्ड",
  careRequestsShortcut: "देखभाल अनुरोध",
  noRecordsYet: "अपने स्वास्थ्य रिकॉर्ड एक साथ रखें। जब तैयार हों, तब पहला रिकॉर्ड जोड़ें।",
  noRecordsYetHint: "रिपोर्ट, पर्चे और स्कैन — सब एक सुरक्षित जगह पर।",
  needsYourAttention: "आपके ध्यान की आवश्यकता",

  online: "आप ऑनलाइन हैं",
  offline: "आप ऑफ़लाइन हैं",
  syncStateAllSynced: "सुरक्षित रूप से सिंक हो गया",
  syncStateAllSyncedHint: "आपने जो भी सहेजा है, वह सुरक्षित बैकअप हो गया है।",
  syncStateOfflinePending: "इस डिवाइस पर सहेजा गया",
  syncStateOfflinePendingHint: "कनेक्शन मिलने पर सहेजी गई चीज़ें अपने आप अपलोड हो जाएँगी।",
  syncStateSyncing: "आपकी सहेजी गई चीज़ें सिंक हो रही हैं",
  syncStateSyncingHint: "धीमे कनेक्शन पर इसमें थोड़ा समय लग सकता है।",
  syncStateNeedsAttention: "कुछ चीज़ों पर ध्यान देना है",
  syncStateNeedsAttentionHint: "एक सहेजी गई चीज़ नहीं भेजी जा सकी। आप नीचे दोबारा कोशिश कर सकते हैं।",
  syncNow: "अभी सिंक करें",
  syncingNow: "सिंक हो रहा है…",
  syncStartedAnnouncement: "सिंक शुरू हुआ।",
  syncCompletedAnnouncement: "सिंक पूरा हुआ। सभी सहेजी गई चीज़ें अपडेट हैं।",
  syncFailedAnnouncement:
    "कुछ सहेजी गई चीज़ें नहीं भेजी जा सकीं। वे इस डिवाइस पर सुरक्षित रखी गई हैं।",
  itemsWaiting: "{count} चीज़ें कनेक्शन की प्रतीक्षा में",
  oneItemWaiting: "1 चीज़ कनेक्शन की प्रतीक्षा में",
  itemsFailed: "{count} चीज़ों पर ध्यान देना है",
  oneItemFailed: "1 चीज़ पर ध्यान देना है",
  viewDetails: "विवरण देखें",
  retryItem: "दोबारा कोशिश करें",
  removeDraft: "सहेजा हुआ ड्राफ़्ट हटाएँ",
  removeDraftConfirmTitle: "यह सहेजी गई चीज़ हटाएँ?",
  removeDraftConfirmBody:
    "यह केवल इस डिवाइस से हटेगी। आपके स्वास्थ्य स्थान को पहले से मिले रिकॉर्ड प्रभावित नहीं होंगे।",
  removeDraftConfirmYes: "हाँ, हटाएँ",
  removeDraftConfirmNo: "रखें",

  takePhoto: "रिकॉर्ड की फोटो लें",
  uploadFile: "फ़ाइल अपलोड करें",
  savedOnDevice: "इस डिवाइस पर सहेजा गया। कनेक्शन मिलने पर अपने आप अपलोड हो जाएगा।",
  savedOnDeviceHint: "ऑफ़लाइन कैप्चर",
  saveForLater: "इस डिवाइस पर सहेजें",
  uploadFailedSavedQueued: "कनेक्शन टूट गया। आपका रिकॉर्ड इस डिवाइस पर सहेज लिया गया है और अपने आप अपलोड होगा।",
  photoLabel: "मेडिकल रिकॉर्ड की फोटो",
  fileLabel: "मेडिकल रिकॉर्ड फ़ाइल",

  careRequestTitle: "देखभाल सहायता का अनुरोध करें",
  careRequestIntro:
    "आप देखभाल क्यों माँग रहे हैं, इसे संक्षेप में बताएँ। यह आपके स्वास्थ्य स्थान में एक नोट बनेगा।",
  notMedicalAdvice: "यह अनुरोध चिकित्सकीय सलाह या आपातकालीन देखभाल नहीं है।",
  emergencyNotice:
    "गंभीर या जानलेवा लक्षणों के लिए, अभी स्थानीय आपातकालीन सेवाओं से संपर्क करें या नज़दीकी आपातकालीन केंद्र जाएँ।",
  reasonLabel: "देखभाल माँगने का संक्षिप्त कारण",
  reasonPlaceholder: "जैसे: मुझे अपनी नई रिपोर्ट समझने में मदद चाहिए",
  contactMethodLabel: "संपर्क का पसंदीदा तरीका",
  contactInApp: "इस ऐप में",
  contactPhone: "फ़ोन",
  contactEmail: "ईमेल",
  languageLabel: "भाषा",
  saveCareRequest: "अनुरोध सहेजें",
  savingCareRequest: "सहेजा जा रहा है…",
  careRequestSavedOffline: "इस डिवाइस पर सहेजा गया। कनेक्शन मिलने पर अपने आप भेज दिया जाएगा।",
  careRequestSavedOnline: "अनुरोध सुरक्षित रूप से सहेज लिया गया।",
  careRequestFailed: "यह अनुरोध सहेजा नहीं जा सका। आपके शब्द इस डिवाइस पर सुरक्षित हैं।",
  requiredReason: "कृपया पहले संक्षिप्त कारण लिखें।",
  emergencyDetected: "अगर यह आपातकाल है, तो कृपया अभी मदद लें:",
  linkedRecordsLabel: "सहेजा हुआ रिकॉर्ड जोड़ें (वैकल्पिक)",
  linkedRecordsHint: "इस डिवाइस पर सहेजे रिकॉर्ड में से चुनें।",
  myCareRequests: "मेरे देखभाल अनुरोध",
  noCareRequestsYet: "अभी कोई देखभाल अनुरोध नहीं है।",
  noCareRequestsYetHint: "सहेजने पर यह यहाँ उसकी स्थिति के साथ दिखेगा।",
  statusDraft: "इस डिवाइस पर सहेजा गया",
  statusSubmitted: "सुरक्षित रूप से पहुँच गया",
  statusProcessing: "प्रक्रिया में",
  statusCompleted: "पूरा हुआ",

  settingsTitle: "सेटिंग्स",
  languageSettings: "भाषा",
  languageSettingsHint: "ऐप की स्क्रीन के लिए भाषा चुनें।",
  languageSyncNote:
    "आपकी भाषा की पसंद इस डिवाइस पर सहेजी जाती है और कनेक्शन मिलने पर सिंक हो जाती है।",
  cancel: "रद्द करें",
};

const or: Dict = {
  appName: "ସ୍ୱାସ୍ଥ୍ୟଫୋଲିଓ",
  welcome: "ଆପଣଙ୍କ ସ୍ୱାସ୍ଥ୍ୟ ସ୍ଥାନକୁ ସ୍ୱାଗତ",
  welcomeOfflineHint:
    "ଆପଣ ରେକର୍ଡ ଓ ଯତ୍ନ ଅନୁରୋଧ ଯୋଗ କରିପାରିବେ। ସଂଯୋଗ ମିଳିବା ପର୍ଯ୍ୟନ୍ତ ସେଗୁଡ଼ିକ ଏହି ଡିଭାଇସରେ ସୁରକ୍ଷିତ ରହିବ।",
  recordsShortcut: "ମୋର ରେକର୍ଡ",
  careRequestsShortcut: "ଯତ୍ନ ଅନୁରୋଧ",
  noRecordsYet: "ନିଜ ସ୍ୱାସ୍ଥ୍ୟ ରେକର୍ଡ ଏକାଠି ରଖନ୍ତୁ। ପ୍ରସ୍ତୁତ ହେଲେ ପ୍ରଥମ ରେକର୍ଡ ଯୋଗ କରନ୍ତୁ।",
  noRecordsYetHint: "ରିପୋର୍ଟ, ପ୍ରେସକ୍ରିପସନ ଓ ସ୍କାନ୍ — ସବୁ ଏକ ସୁରକ୍ଷିତ ସ୍ଥାନରେ।",
  needsYourAttention: "ଆପଣଙ୍କ ଧ୍ୟାନ ଦରକାର",

  online: "ଆପଣ ଅନଲାଇନ୍ ଅଛନ୍ତି",
  offline: "ଆପଣ ଅଫଲାଇନ୍ ଅଛନ୍ତି",
  syncStateAllSynced: "ସୁରକ୍ଷିତ ଭାବରେ ସିଙ୍କ ହୋଇଗଲା",
  syncStateAllSyncedHint: "ଆପଣ ସଂରକ୍ଷଣ କରିଥିବା ସବୁ ନିରାପଦରେ ବ୍ୟାକଅପ ହୋଇଗଲା।",
  syncStateOfflinePending: "ଏହି ଡିଭାଇସରେ ସଂରକ୍ଷିତ",
  syncStateOfflinePendingHint: "ସଂଯୋଗ ମିଳିଲେ ସଂରକ୍ଷିତ ଜିନିଷ ଆପେଆପେ ଅପଲୋଡ ହୋଇଯିବ।",
  syncStateSyncing: "ଆପଣଙ୍କ ସଂରକ୍ଷିତ ଜିନିଷ ସିଙ୍କ ହେଉଛି",
  syncStateSyncingHint: "ଧୀର ସଂଯୋଗରେ ଏଥିପାଇଁ କିଛି ସମୟ ଲାଗିପାରେ।",
  syncStateNeedsAttention: "କିଛି ଜିନିଷରେ ଧ୍ୟାନ ଦେବା ଦରକାର",
  syncStateNeedsAttentionHint: "ଗୋଟିଏ ସଂରକ୍ଷିତ ଜିନିଷ ପଠାଯାଇପାରିଲା ନାହିଁ। ତଳେ ପୁଣି ଚେଷ୍ଟା କରିପାରିବେ।",
  syncNow: "ଏବେ ସିଙ୍କ କରନ୍ତୁ",
  syncingNow: "ସିଙ୍କ ହେଉଛି…",
  syncStartedAnnouncement: "ସିଙ୍କ ଆରମ୍ଭ ହେଲା।",
  syncCompletedAnnouncement: "ସିଙ୍କ ସମ୍ପୂର୍ଣ୍ଣ। ସଂରକ୍ଷିତ ସବୁ ଜିନିଷ ଅପଡେଟ ଅଛି।",
  syncFailedAnnouncement:
    "କିଛି ସଂରକ୍ଷିତ ଜିନିଷ ପଠାଯାଇପାରିଲା ନାହିଁ। ସେଗୁଡ଼ିକ ଏହି ଡିଭାଇସରେ ସୁରକ୍ଷିତ ଅଛି।",
  itemsWaiting: "{count} ଜିନିଷ ସଂଯୋଗ ପାଇଁ ଅପେକ୍ଷାରତ",
  oneItemWaiting: "1 ଜିନିଷ ସଂଯୋଗ ପାଇଁ ଅପେକ୍ଷାରତ",
  itemsFailed: "{count} ଜିନିଷରେ ଧ୍ୟାନ ଦେବା ଦରକାର",
  oneItemFailed: "1 ଜିନିଷରେ ଧ୍ୟାନ ଦେବା ଦରକାର",
  viewDetails: "ବିବରଣୀ ଦେଖନ୍ତୁ",
  retryItem: "ପୁଣି ଚେଷ୍ଟା କରନ୍ତୁ",
  removeDraft: "ସଂରକ୍ଷିତ ଡ୍ରାଫ୍ଟ ହଟାନ୍ତୁ",
  removeDraftConfirmTitle: "ଏହି ସଂରକ୍ଷିତ ଜିନିଷ ହଟାଇବେ?",
  removeDraftConfirmBody:
    "ଏହା କେବଳ ଏହି ଡିଭାଇସରୁ ହଟିବ। ଆପଣଙ୍କ ସ୍ୱାସ୍ଥ୍ୟ ସ୍ଥାନକୁ ପହଞ୍ଚିଥିବା ରେକର୍ଡ ପ୍ରଭାବିତ ହେବ ନାହିଁ।",
  removeDraftConfirmYes: "ହଁ, ହଟାନ୍ତୁ",
  removeDraftConfirmNo: "ରଖନ୍ତୁ",

  takePhoto: "ରେକର୍ଡର ଫୋଟୋ ନିଅନ୍ତୁ",
  uploadFile: "ଫାଇଲ୍ ଅପଲୋଡ କରନ୍ତୁ",
  savedOnDevice: "ଏହି ଡିଭାଇସରେ ସଂରକ୍ଷିତ। ସଂଯୋଗ ମିଳିଲେ ଆପେଆପେ ଅପଲୋଡ ହୋଇଯିବ।",
  savedOnDeviceHint: "ଅଫଲାଇନ୍ କ୍ୟାପଚର",
  saveForLater: "ଏହି ଡିଭାଇସରେ ସଂରକ୍ଷଣ କରନ୍ତୁ",
  uploadFailedSavedQueued: "ସଂଯୋଗ ବିଚ୍ଛିନ୍ନ ହେଲା। ଆପଣଙ୍କ ରେକର୍ଡ ଏହି ଡିଭାଇସରେ ସଂରକ୍ଷିତ ଅଛି ଓ ଆପେଆପେ ଅପଲୋଡ ହେବ।",
  photoLabel: "ମେଡିକାଲ୍ ରେକର୍ଡର ଫୋଟୋ",
  fileLabel: "ମେଡିକାଲ୍ ରେକର୍ଡ ଫାଇଲ୍",

  careRequestTitle: "ଯତ୍ନ ସହାୟତା ଅନୁରୋଧ କରନ୍ତୁ",
  careRequestIntro: "ଆପଣ କାହିଁକି ଯତ୍ନ ମାଗୁଛନ୍ତି, ସଂକ୍ଷେପରେ ଲେଖନ୍ତୁ। ଏହା ଆପଣଙ୍କ ସ୍ୱାସ୍ଥ୍ୟ ସ୍ଥାନରେ ଏକ ଟିପ୍ପଣୀ ହେବ।",
  notMedicalAdvice: "ଏହି ଅନୁରୋଧ ଚିକିତ୍ସା ପରାମର୍ଶ କିମ୍ବା ଆପାତକାଳୀନ ଯତ୍ନ ନୁହେଁ।",
  emergencyNotice:
    "ଗମ୍ଭୀର କିମ୍ବା ଜୀବନ ପ୍ରତି ବିପଦ ଥିବା ଲକ୍ଷଣ ପାଇଁ, ଏବେ ସ୍ଥାନୀୟ ଆପାତକାଳୀନ ସେବାରେ ଯୋଗାଯୋଗ କରନ୍ତୁ କିମ୍ବା ନିକଟତମ ଆପାତକାଳୀନ କେନ୍ଦ୍ରକୁ ଯାଆନ୍ତୁ।",
  reasonLabel: "ଯତ୍ନ ମାଗିବାର ସଂକ୍ଷିପ୍ତ କାରଣ",
  reasonPlaceholder: "ଯେପରି: ମୋର ନୂଆ ରିପୋର୍ଟ ବୁଝିବାରେ ସାହାଯ୍ୟ ଦରକାର",
  contactMethodLabel: "ଯୋଗାଯୋଗର ପସନ୍ଦର ଉପାୟ",
  contactInApp: "ଏହି ଆପରେ",
  contactPhone: "ଫୋନ୍",
  contactEmail: "ଇମେଲ୍",
  languageLabel: "ଭାଷା",
  saveCareRequest: "ଅନୁରୋଧ ସଂରକ୍ଷଣ କରନ୍ତୁ",
  savingCareRequest: "ସଂରକ୍ଷଣ ହେଉଛି…",
  careRequestSavedOffline: "ଏହି ଡିଭାଇସରେ ସଂରକ୍ଷିତ। ସଂଯୋଗ ମିଳିଲେ ଆପେଆପେ ପଠାଯିବ।",
  careRequestSavedOnline: "ଅନୁରୋଧ ସୁରକ୍ଷିତ ଭାବରେ ସଂରକ୍ଷିତ ହେଲା।",
  careRequestFailed: "ଏହି ଅନୁରୋଧ ସଂରକ୍ଷିତ ହୋଇପାରିଲା ନାହିଁ। ଆପଣଙ୍କ ଶବ୍ଦ ଏହି ଡିଭାଇସରେ ସୁରକ୍ଷିତ ଅଛି।",
  requiredReason: "ଦୟାକରି ପ୍ରଥମେ ସଂକ୍ଷିପ୍ତ କାରଣ ଲେଖନ୍ତୁ।",
  emergencyDetected: "ଯଦି ଏହା ଆପାତକାଳ ଅଟେ, ଦୟାକରି ଏବେ ସାହାଯ୍ୟ ନିଅନ୍ତୁ:",
  linkedRecordsLabel: "ସଂରକ୍ଷିତ ରେକର୍ଡ ଯୋଡ଼ନ୍ତୁ (ଇଚ୍ଛାଧୀନ)",
  linkedRecordsHint: "ଏହି ଡିଭାଇସରେ ସଂରକ୍ଷିତ ରେକର୍ଡ ମଧ୍ୟରୁ ବାଛନ୍ତୁ।",
  myCareRequests: "ମୋର ଯତ୍ନ ଅନୁରୋଧ",
  noCareRequestsYet: "ଏବେ କୌଣସି ଯତ୍ନ ଅନୁରୋଧ ନାହିଁ।",
  noCareRequestsYetHint: "ସଂରକ୍ଷଣ କଲେ ଏହା ଏଠାରେ ତାର ସ୍ଥିତି ସହ ଦେଖାଯିବ।",
  statusDraft: "ଏହି ଡିଭାଇସରେ ସଂରକ୍ଷିତ",
  statusSubmitted: "ସୁରକ୍ଷିତ ଭାବରେ ପହଞ୍ଚିଗଲା",
  statusProcessing: "ପ୍ରକ୍ରିୟାରତ",
  statusCompleted: "ସମ୍ପୂର୍ଣ୍ଣ",

  settingsTitle: "ସେଟିଂସ୍",
  languageSettings: "ଭାଷା",
  languageSettingsHint: "ଆପ ପାଇଁ ଭାଷା ବାଛନ୍ତୁ।",
  languageSyncNote: "ଆପଣଙ୍କ ଭାଷା ପସନ୍ଦ ଏହି ଡିଭାଇସରେ ସଂରକ୍ଷିତ ହୁଏ ଓ ସଂଯୋଗ ମିଳିଲେ ସିଙ୍କ ହୋଇଯାଏ।",
  cancel: "ବାତିଲ କରନ୍ତୁ",
};

const DICTIONARIES: Record<Language, Dict> = { en, hi, or };

export function translate(
  lang: Language,
  key: keyof Dict,
  vars?: Record<string, string | number>
): string {
  let text: string = DICTIONARIES[lang]?.[key] ?? DICTIONARIES.en[key] ?? String(key);
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.replace(new RegExp(`\\{${name}\\}`, "g"), String(value));
    }
  }
  return text;
}

export function hasTranslation(lang: Language, key: keyof Dict): boolean {
  return Boolean(DICTIONARIES[lang]?.[key]);
}
