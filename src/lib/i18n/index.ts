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

  // Rural-first home actions (Phase 4)
  homeChooseAction: string;
  homeTalkToDoctor: string;
  homeTalkToDoctorHint: string;
  homeCheckSymptoms: string;
  homeCheckSymptomsHint: string;
  homeCheckMedicine: string;
  homeCheckMedicineHint: string;
  homeMyHealth: string;
  homeMyHealthHint: string;

  // Dashboard content (Phase 4)
  dashboardUploadTitle: string;
  dashboardUploadHint: string;
  dashboardNeedsAttention: string;
  dashboardReview: string;
  dashboardLatestInsight: string;
  dashboardNoInsightsTitle: string;
  dashboardNoInsightsHint: string;
  dashboardEmptyHint: string;
  dashboardRecordsOne: string;
  dashboardRecordsMany: string;
  dashboardAttentionDocsOne: string;
  dashboardAttentionDocsMany: string;
  dashboardAttentionDocsHint: string;
  dashboardAttentionMeasurementsOne: string;
  dashboardAttentionMeasurementsMany: string;
  dashboardAttentionMeasurementsHint: string;
  dashboardAttentionPaused: string;
  dashboardAttentionPausedHint: string;
  dashboardRecentActivity: string;
  dashboardViewAllRecords: string;
  dashboardRecentEmpty: string;
  dashboardNoDocuments: string;
  dashboardProcessingEmpty: string;
  dashboardRunComplete: string;
  dashboardRunNeedsAttention: string;
  dashboardRunWaiting: string;
  dashboardRunProcessing: string;
  dashboardPointsOne: string;
  dashboardPointsMany: string;
  dashboardEvidenceNote: string;
  dashboardOpenRecords: string;
  dashboardStatusProcessed: string;
  dashboardStatusReview: string;
  dashboardStatusUploaded: string;
  dashboardStatusExtracting: string;
  dashboardStatusClassifying: string;
  dashboardStatusOrganizing: string;
  onboardingTitle: string;
  onboardingIntro: string;
  onboardingCanAdd: string;
  onboardingLab: string;
  onboardingRx: string;
  onboardingScans: string;
  onboardingDischarge: string;
  onboardingUpload: string;
  onboardingCreate: string;
  onboardingPreparing: string;
  onboardingCreating: string;
  onboardingPrivacy: string;
  dashboardLoadFailTitle: string;
  dashboardLoadFailHint: string;
  tryAgain: string;
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

  // Rural-first home actions
  homeChooseAction: "What do you want to do?",
  homeTalkToDoctor: "Talk to a Doctor",
  homeTalkToDoctorHint: "Describe your problem and get care support",
  homeCheckSymptoms: "Check My Symptoms",
  homeCheckSymptomsHint: "See how urgent it is, step by step",
  homeCheckMedicine: "Check Medicine",
  homeCheckMedicineHint: "See if it is available near you before you travel",
  homeMyHealth: "My Health",
  homeMyHealthHint: "Your records, tests and offline health card",

  // Dashboard content
  dashboardUploadTitle: "Scan or upload a record",
  dashboardUploadHint:
    "Take a photo of a report or upload a file — Healthfolio reads it and shows you what to confirm.",
  dashboardNeedsAttention: "Needs your attention",
  dashboardReview: "Review",
  dashboardLatestInsight: "Latest verified insight",
  dashboardNoInsightsTitle: "No verified health insights yet",
  dashboardNoInsightsHint:
    "Once you confirm the details Healthfolio reads from your reports, your trends and timeline appear here.",
  dashboardEmptyHint:
    "Build your health timeline by adding your first medical record.",
  dashboardRecordsOne: "1 record organized so far. Here's where things stand.",
  dashboardRecordsMany:
    "{count} records organized so far. Here's where things stand.",
  dashboardAttentionDocsOne: "1 document with uncertain details",
  dashboardAttentionDocsMany: "{count} documents with uncertain details",
  dashboardAttentionDocsHint: "A quick look keeps your timeline accurate.",
  dashboardAttentionMeasurementsOne: "1 measurement awaiting your confirmation",
  dashboardAttentionMeasurementsMany:
    "{count} measurements awaiting your confirmation",
  dashboardAttentionMeasurementsHint: "Confirmed values make your trends reliable.",
  dashboardAttentionPaused: "Processing is paused for your input",
  dashboardAttentionPausedHint: "Resolve the open items to continue organizing.",
  dashboardRecentActivity: "Recent activity",
  dashboardViewAllRecords: "View all records",
  dashboardRecentEmpty:
    "Your organized records will appear here after your first upload is processed.",
  dashboardNoDocuments: "No documents yet.",
  dashboardProcessingEmpty:
    "Processing activity will appear after your first upload.",
  dashboardRunComplete: "Complete",
  dashboardRunNeedsAttention: "Needs attention",
  dashboardRunWaiting: "Waiting for you",
  dashboardRunProcessing: "Processing",
  dashboardPointsOne: "1 point",
  dashboardPointsMany: "{count} points",
  dashboardEvidenceNote:
    "Source document · page {page}. Open the Records page to view the full document.",
  dashboardOpenRecords: "Open Records",
  dashboardStatusProcessed: "Processed",
  dashboardStatusReview: "Review needed",
  dashboardStatusUploaded: "Uploaded",
  dashboardStatusExtracting: "Reading document",
  dashboardStatusClassifying: "Identifying type",
  dashboardStatusOrganizing: "Organizing",
  onboardingTitle: "Welcome to your health space",
  onboardingIntro:
    "Add your first medical record to start. Healthfolio organizes reports, prescriptions and scans into one private, verified space.",
  onboardingCanAdd: "You can add:",
  onboardingLab: "Lab reports",
  onboardingRx: "Prescriptions",
  onboardingScans: "Scan images",
  onboardingDischarge: "Discharge summaries",
  onboardingUpload: "Scan or upload a record",
  onboardingCreate: "Just create my space",
  onboardingPreparing: "Preparing…",
  onboardingCreating: "Creating…",
  onboardingPrivacy:
    "Your documents remain private to your account and are processed only for your Healthfolio.",
  dashboardLoadFailTitle: "We couldn't load your health space right now",
  dashboardLoadFailHint:
    "This is usually a connection issue. Your records are safe — try again in a moment.",
  tryAgain: "Try again",
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

  // Rural-first home actions
  homeChooseAction: "आप क्या करना चाहते हैं?",
  homeTalkToDoctor: "डॉक्टर से बात करें",
  homeTalkToDoctorHint: "अपनी समस्या बताएँ और देखभाल सहायता पाएँ",
  homeCheckSymptoms: "लक्षण जाँचें",
  homeCheckSymptomsHint: "कदम-दर-कदम जानें कि कितनी जल्दी देखभाल चाहिए",
  homeCheckMedicine: "दवा जाँचें",
  homeCheckMedicineHint: "यात्रा से पहले जानें कि दवा पास में मिलेगी या नहीं",
  homeMyHealth: "मेरा स्वास्थ्य",
  homeMyHealthHint: "आपके रिकॉर्ड, टेस्ट और ऑफ़लाइन हेल्थ कार्ड",

  // Dashboard content
  dashboardUploadTitle: "रिकॉर्ड स्कैन या अपलोड करें",
  dashboardUploadHint:
    "रिपोर्ट की फोटो लें या फ़ाइल अपलोड करें — Healthfolio इसे पढ़ता है और पुष्टि के लिए दिखाता है।",
  dashboardNeedsAttention: "आपका ध्यान चाहिए",
  dashboardReview: "देखें",
  dashboardLatestInsight: "नवीनतम सत्यापित जानकारी",
  dashboardNoInsightsTitle: "अभी कोई सत्यापित स्वास्थ्य जानकारी नहीं",
  dashboardNoInsightsHint:
    "जब आप Healthfolio द्वारा पढ़ी गई जानकारी की पुष्टि करेंगे, तो आपके ट्रेंड और टाइमलाइन यहाँ दिखेंगे।",
  dashboardEmptyHint:
    "अपना पहला मेडिकल रिकॉर्ड जोड़कर स्वास्थ्य टाइमलाइन बनाएँ।",
  dashboardRecordsOne: "अब तक 1 रिकॉर्ड व्यवस्थित हुआ है। यहाँ स्थिति देखें।",
  dashboardRecordsMany:
    "अब तक {count} रिकॉर्ड व्यवस्थित हुए हैं। यहाँ स्थिति देखें।",
  dashboardAttentionDocsOne: "1 डॉक्यूमेंट में कुछ विवरण अनिश्चित हैं",
  dashboardAttentionDocsMany: "{count} डॉक्यूमेंट में कुछ विवरण अनिश्चित हैं",
  dashboardAttentionDocsHint: "झटपट देखने से टाइमलाइन सही रहती है।",
  dashboardAttentionMeasurementsOne: "1 माप आपकी पुष्टि की प्रतीक्षा में",
  dashboardAttentionMeasurementsMany:
    "{count} माप आपकी पुष्टि की प्रतीक्षा में",
  dashboardAttentionMeasurementsHint: "पुष्ट किए गए मान आपके ट्रेंड को भरोसेमंद बनाते हैं।",
  dashboardAttentionPaused: "प्रसंस्करण आपके इनपुट के लिए रुका है",
  dashboardAttentionPausedHint: "जारी रखने के लिए खुली आइटम दर्ज करें।",
  dashboardRecentActivity: "हाल की गतिविधि",
  dashboardViewAllRecords: "सभी रिकॉर्ड देखें",
  dashboardRecentEmpty:
    "आपके व्यवस्थित रिकॉर्ड पहले अपलोड के प्रसंस्करण के बाद यहाँ दिखेंगे।",
  dashboardNoDocuments: "अभी कोई डॉक्यूमेंट नहीं।",
  dashboardProcessingEmpty:
    "प्रसंस्करण गतिविधि पहले अपलोड के बाद दिखेगी।",
  dashboardRunComplete: "पूर्ण",
  dashboardRunNeedsAttention: "ध्यान चाहिए",
  dashboardRunWaiting: "आपकी प्रतीक्षा में",
  dashboardRunProcessing: "प्रसंस्करण",
  dashboardPointsOne: "1 बिंदु",
  dashboardPointsMany: "{count} बिंदु",
  dashboardEvidenceNote:
    "स्रोत डॉक्यूमेंट · पृष्ठ {page}। पूरा डॉक्यूमेंट देखने के लिए रिकॉर्ड पृष्ठ खोलें।",
  dashboardOpenRecords: "रिकॉर्ड खोलें",
  dashboardStatusProcessed: "प्रसंस्कृत",
  dashboardStatusReview: "समीक्षा चाहिए",
  dashboardStatusUploaded: "अपलोड हुआ",
  dashboardStatusExtracting: "डॉक्यूमेंट पढ़ा जा रहा है",
  dashboardStatusClassifying: "प्रकार पहचाना जा रहा है",
  dashboardStatusOrganizing: "व्यवस्थित किया जा रहा है",
  onboardingTitle: "अपने स्वास्थ्य स्थान में स्वागत है",
  onboardingIntro:
    "शुरू करने के लिए अपना पहला मेडिकल रिकॉर्ड जोड़ें। Healthfolio रिपोर्ट, पर्चे और स्कैन को एक निजी, सत्यापित स्थान में व्यवस्थित करता है।",
  onboardingCanAdd: "आप जोड़ सकते हैं:",
  onboardingLab: "लैब रिपोर्ट",
  onboardingRx: "पर्चे",
  onboardingScans: "स्कैन इमेज",
  onboardingDischarge: "डिस्चार्ज सारांश",
  onboardingUpload: "रिकॉर्ड स्कैन या अपलोड करें",
  onboardingCreate: "बस मेरा स्थान बनाएँ",
  onboardingPreparing: "तैयार हो रहा है…",
  onboardingCreating: "बनाया जा रहा है…",
  onboardingPrivacy:
    "आपके डॉक्यूमेंट आपके खाते के लिए निजी रहते हैं और केवल आपके Healthfolio के लिए प्रसंस्कृत होते हैं।",
  dashboardLoadFailTitle: "अभी आपका स्वास्थ्य स्थान लोड नहीं हो सका",
  dashboardLoadFailHint:
    "यह आमतौर पर कनेक्शन की समस्या है। आपके रिकॉर्ड सुरक्षित हैं — कुछ देर में पुनः प्रयास करें।",
  tryAgain: "फिर प्रयास करें",
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

  // Rural-first home actions
  homeChooseAction: "ଆପଣ କ'ଣ କରିବାକୁ ଚାହୁଁଛ?",
  homeTalkToDoctor: "ଡାକ୍ତରଙ୍କ ସହ କଥା ହୁଅନ୍ତୁ",
  homeTalkToDoctorHint: "ଆପଣଙ୍କ ସମସ୍ୟା କହନ୍ତୁ ଏବଂ ଯତ୍ନ ସହାୟତା ପାନ୍ତୁ",
  homeCheckSymptoms: "ଲକ୍ଷଣ ଯାଞ୍ଚ କରନ୍ତୁ",
  homeCheckSymptomsHint: "ପଦକ୍ଷେପ ଦର ପଦକ୍ଷେପ ଜାଣନ୍ତୁ କେତେ ଜଲ୍ଦି ଦେଖାଯିବା ଆବଶ୍ୟକ",
  homeCheckMedicine: "ଔଷଧ ଯାଞ୍ଚ କରନ୍ତୁ",
  homeCheckMedicineHint: "ଯାତ୍ରା ଆଗରୁ ଜାଣନ୍ତୁ ଔଷଧ ନିକଟରେ ମିଳିବ କି ନାହିଁ",
  homeMyHealth: "ମୋର ସ୍ୱାସ୍ଥ୍ୟ",
  homeMyHealthHint: "ଆପଣଙ୍କ ରେକର୍ଡ, ଟେଷ୍ଟ ଏବଂ ଅଫଲାଇନ୍ ହେଲ୍ଥ୍ କାର୍ଡ",

  // Dashboard content
  dashboardUploadTitle: "ରେକର୍ଡ ସ୍କାନ୍ କିମ୍ବା ଅପଲୋଡ୍ କରନ୍ତୁ",
  dashboardUploadHint:
    "ରିପୋର୍ଟର ଫୋଟୋ ନିଅନ୍ତୁ କିମ୍ବା ଫାଇଲ୍ ଅପଲୋଡ୍ କରନ୍ତୁ — Healthfolio ଏହା ପଢ଼ି ପୁଷ୍ଟି ପାଇଁ ଦେଖାଏ।",
  dashboardNeedsAttention: "ଆପଣଙ୍କ ଦୃଷ୍ଟି ଆବଶ୍ୟକ",
  dashboardReview: "ଦେଖନ୍ତୁ",
  dashboardLatestInsight: "ନୂତନ ଯାଞ୍ଚାଯାଇଥିବା ତଥ୍ୟ",
  dashboardNoInsightsTitle: "ଏହିସମୟ କୌଣସି ଯାଞ୍ଚାଯାଇଥିବା ସ୍ୱାସ୍ଥ୍ୟ ତଥ୍ୟ ନାହିଁ",
  dashboardNoInsightsHint:
    "Healthfolio ଦ୍ୱାରା ପଢ଼ାଯାଇଥିବା ତଥ୍ୟ ଆପଣ ଯତ୍ନରେ ପୁଷ୍ଟି କଲେ ଆପଣଙ୍କ ଟ୍ରେଣ୍ଡ ଏବଂ ଟାଇମଲାଇନ୍ ଏଠାରେ ଦେଖାଯିବ।",
  dashboardEmptyHint:
    "ପ୍ରଥମ ମେଡିକାଲ୍ ରେକର୍ଡ ଯୋଗ କରି ସ୍ୱାସ୍ଥ୍ୟ ଟାଇମଲାଇନ୍ ତିଆରି କରନ୍ତୁ।",
  dashboardRecordsOne: "ଏକଟି ରେକର୍ଡ ଏବେ ସଜାଯାଇଛି। ସ୍ଥିତି ଏଠାରେ ଦେଖନ୍ତୁ।",
  dashboardRecordsMany:
    "{count} ଟି ରେକର୍ଡ ଏବେ ସଜାଯାଇଛି। ସ୍ଥିତି ଏଠାରେ ଦେଖନ୍ତୁ।",
  dashboardAttentionDocsOne: "ଗୋଟିଏ ଡକ୍ୟୁମେଣ୍ଟରେ କିଛି ବିବରଣ ଅନିଶ୍ଚିତ",
  dashboardAttentionDocsMany: "{count} ଟି ଡକ୍ୟୁମେଣ୍ଟରେ କିଛି ବିବରଣ ଅନିଶ୍ଚିତ",
  dashboardAttentionDocsHint: "ଝଟପଟି ଦେଖିଲେ ଟାଇମଲାଇନ୍ ସଠିକ୍ ରହେ।",
  dashboardAttentionMeasurementsOne: "ଗୋଟିଏ ମାପ ଆପଣଙ୍କ ପୁଷ୍ଟି ପାଇଁ ଅପେକ୍ଷାରେ",
  dashboardAttentionMeasurementsMany:
    "{count} ଟି ମାପ ଆପଣଙ୍କ ପୁଷ୍ଟି ପାଇଁ ଅପେକ୍ଷାରେ",
  dashboardAttentionMeasurementsHint: "ପୁଷ୍ଟ ହୋଇଥିବା ମାନ ଆପଣଙ୍କ ଟ୍ରେଣ୍ଡକୁ ବିଶ୍ୱସନୀୟ କରେ।",
  dashboardAttentionPaused: "ପ୍ରସ୍ତୁତି ଆପଣଙ୍କ ଇନପୁଟ ପାଇଁ ଅଟକିଛି",
  dashboardAttentionPausedHint: "ଜାରି ରଖିବା ପାଇଁ ଖୋଲା ଆଇଟମ ସମାଧାନ କରନ୍ତୁ।",
  dashboardRecentActivity: "ସାମ୍ପ୍ରତିକ ଗତିବିଧି",
  dashboardViewAllRecords: "ସବୁ ରେକର୍ଡ ଦେଖନ୍ତୁ",
  dashboardRecentEmpty:
    "ଆପଣଙ୍କ ସଜାଯାଇଥିବା ରେକର୍ଡ ପ୍ରଥମ ଅପଲୋଡ୍ ପ୍ରସ୍ତୁତି ପରେ ଏଠାରେ ଦେଖାଯିବ।",
  dashboardNoDocuments: "ଏହିସମୟ କୌଣସି ଡକ୍ୟୁମେଣ୍ଟ ନାହିଁ।",
  dashboardProcessingEmpty:
    "ପ୍ରସ୍ତୁତି ଗତିବିଧି ପ୍ରଥମ ଅପଲୋଡ୍ ପରେ ଦେଖାଯିବ।",
  dashboardRunComplete: "ସମ୍ପୂର୍ଣ୍ଣ",
  dashboardRunNeedsAttention: "ଦୃଷ୍ଟି ଆବଶ୍ୟକ",
  dashboardRunWaiting: "ଆପଣଙ୍କ ଅପେକ୍ଷାରେ",
  dashboardRunProcessing: "ପ୍ରସ୍ତୁତି",
  dashboardPointsOne: "ଗୋଟିଏ ବିନ୍ଦୁ",
  dashboardPointsMany: "{count} ଟି ବିନ୍ଦୁ",
  dashboardEvidenceNote:
    "ସ୍ରୋତ ଡକ୍ୟୁମେଣ୍ଟ · ପୃଷ୍ଠା {page}। ସମ୍ପୂର୍ଣ୍ଣ ଡକ୍ୟୁମେଣ୍ଟ ଦେଖିବା ପାଇଁ ରେକର୍ଡ ପୃଷ୍ଠା ଖୋଲନ୍ତୁ।",
  dashboardOpenRecords: "ରେକର୍ଡ ଖୋଲନ୍ତୁ",
  dashboardStatusProcessed: "ପ୍ରସ୍ତୁତ",
  dashboardStatusReview: "ସମୀକ୍ଷା ଆବଶ୍ୟକ",
  dashboardStatusUploaded: "ଅପଲୋଡ୍ ହୋଇଛି",
  dashboardStatusExtracting: "ଡକ୍ୟୁମେଣ୍ଟ ପଢ଼ାଯାଉଛି",
  dashboardStatusClassifying: "ପ୍ରକାର ଚିହ୍ନଟ ହେଉଛି",
  dashboardStatusOrganizing: "ସଜାଯାଉଛି",
  onboardingTitle: "ଆପଣଙ୍କ ସ୍ୱାସ୍ଥ୍ୟ ସ୍ଥାନକୁ ସ୍ୱାଗତ",
  onboardingIntro:
    "ଆରମ୍ଭ କରିବା ପାଇଁ ପ୍ରଥମ ମେଡିକାଲ୍ ରେକର୍ଡ ଯୋଗ କରନ୍ତୁ। Healthfolio ରିପୋର୍ଟ, ପ୍ରେସ୍କ୍ରିପ୍ସନ୍ ଏବଂ ସ୍କାନ୍କୁ ଗୋଟିଏ ନିଜି, ଯାଞ୍ଚାଯାଇଥିବା ସ୍ଥାନରେ ସଜାଏ।",
  onboardingCanAdd: "ଆପଣ ଯୋଗ କରପାରିବେ:",
  onboardingLab: "ଲ୍ୟାବ୍ ରିପୋର୍ଟ",
  onboardingRx: "ପ୍ରେସ୍କ୍ରିପ୍ସନ୍",
  onboardingScans: "ସ୍କାନ୍ ଇମେଜ୍",
  onboardingDischarge: "ଡିସ୍ଚାର୍ଜ୍ ସାରାଂଶ",
  onboardingUpload: "ରେକର୍ଡ ସ୍କାନ୍ କିମ୍ବା ଅପଲୋଡ୍ କରନ୍ତୁ",
  onboardingCreate: "କେବଳ୍ ମୋର ସ୍ଥାନ ତିଆରି କରନ୍ତୁ",
  onboardingPreparing: "ତିଆରି ହେଉଛି…",
  onboardingCreating: "ତିଆରି ହେଉଛି…",
  onboardingPrivacy:
    "ଆପଣଙ୍କ ଡକ୍ୟୁମେଣ୍ଟ ଆପଣଙ୍କ ଖାତା ପାଇଁ ନିଜି ରହେ ଏବଂ କେବଳ୍ ଆପଣଙ୍କ Healthfolio ପାଇଁ ପ୍ରସ୍ତୁତ ହୁଏ।",
  dashboardLoadFailTitle: "ଏହିସମୟ ଆପଣଙ୍କ ସ୍ୱାସ୍ଥ୍ୟ ସ୍ଥାନ ଲୋଡ୍ ହୋଇପାରିଲା ନାହିଁ",
  dashboardLoadFailHint:
    "ଏହା ସାଧାରଣତଃ ସଂଯୋଗ ସମସ୍ୟା। ଆପଣଙ୍କ ରେକର୍ଡ ସୁରକ୍ଷିତ — ଏକ ମିନିଟ ପରେ ପୁଣି ପ୍ରୟାସ କରନ୍ତୁ।",
  tryAgain: "ପୁଣି ପ୍ରୟାସ କରନ୍ତୁ",
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
