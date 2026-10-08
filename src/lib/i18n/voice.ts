/**
 * Voice assistant strings (spec §70, §14, §13).
 *
 * Every assistant-facing string lives here in all three languages.
 * Symptom-checker result wording (safeEmergency / safeUrgent /
 * safeRoutine, follow-up questions) is NOT duplicated — the voice
 * layer reuses the Phase 2 dict so the deterministic engine's
 * safety wording stays identical across text and voice.
 */

import type { Language } from "./index";

export interface VoiceDict {
  // ── Assistant chrome ──────────────────────────────────────────
  assistantTitle: string;
  assistantGreeting: string;
  micTap: string;
  listening: string;
  understanding: string;
  speaking: string;
  waiting: string;
  tryAgain: string;
  cancel: string;
  stop: string;
  confirm: string;
  yes: string;
  no: string;
  notSure: string;
  voiceUnavailable: string;
  internetUnavailable: string;
  youSaid: string;
  correct: string;
  retry: string;
  quickSymptoms: string;
  quickDoctor: string;
  quickMedicine: string;
  quickHealthCard: string;
  sessionEnded: string;
  sessionTimeout: string;
  didYouMean: string;
  whichLanguage: string;
  langEn: string;
  langHi: string;
  langOr: string;
  heardNothing: string;
  voiceStopped: string;
  offlineBanner: string;
  voiceRepeat: string;
  voiceEndSession: string;
  voiceNoMic: string;
  voiceConfirmPrompt: string;
  voiceTypeHint: string;
  voiceSend: string;
  voiceLanguage: string;
  voicePrivacyNote: string;
  voiceTimeJustNow: string;
  voiceTimeMinutes: string;
  voiceTimeHours: string;
  voiceTimeDays: string;
  voiceStateIdle: string;
  voiceStateExecuting: string;
  voiceStateClarify: string;
  voiceStateError: string;
  voiceStateFallback: string;
  voiceStateEnding: string;
  respDoctorRequested: string;

  // ── Response templates ────────────────────────────────────────
  respHelp: string;
  respUnknown: string;
  respRepeatUnavailable: string;
  respClarifySymptom: string;
  respSymptomsUnderstood: string;
  respTriageExplain: string;
  respOfflineExplain: string;
  respSyncExplain: string;
  respDoctorAskLanguage: string;
  respDoctorFound: string;
  respDoctorNone: string;
  respDoctorStatus: string;
  respConfirmDoctor: string;
  respMedicineFound: string;
  respMedicineNone: string;
  respMedicineStale: string;
  respHealthCardUpdated: string;
  respHealthCardStale: string;
  respHealthCardEmpty: string;
  respMedicinesList: string;
  respNoMedicines: string;
  respShareConfirm: string;
  respConfirmConsultation: string;
  respSwitchedAudio: string;
  respConfirmEnd: string;
  respOfflineQueue: string;
  respMicDenied: string;
  respMicUnavailable: string;
  respRecognitionFailed: string;
  respAiUnavailable: string;
  respNetworkWeak: string;
  respLanguageChanged: string;
  respCancelled: string;
  respEnded: string;
  respActionFailed: string;
  respUnauthorized: string;
  respDuplicate: string;
  respConsultationStarted: string;
  respConsultationAudio: string;
  respConsultationEnding: string;
  voiceCareStatusDraft: string;
  voiceCareStatusSubmitted: string;
  voiceCareStatusProcessing: string;
  voiceCareStatusCompleted: string;
}

const en: VoiceDict = {
  assistantTitle: "Talk to HealthFolio",
  assistantGreeting: "How can I help you?",
  micTap: "Tap and speak",
  listening: "Listening…",
  understanding: "Understanding…",
  speaking: "Speaking…",
  waiting: "Waiting for your answer…",
  tryAgain: "Try again",
  cancel: "Cancel",
  stop: "Stop",
  confirm: "Confirm",
  yes: "Yes",
  no: "No",
  notSure: "Not sure",
  voiceUnavailable: "Voice input unavailable — use buttons",
  internetUnavailable: "Internet unavailable",
  youSaid: "You said:",
  correct: "Correct",
  retry: "Try again",
  quickSymptoms: "Symptoms",
  quickDoctor: "Doctor",
  quickMedicine: "Medicine",
  quickHealthCard: "Health Card",
  sessionEnded: "Voice session ended. Tap the microphone to start again.",
  sessionTimeout: "Voice session ended after a pause. Tap the microphone to start again.",
  didYouMean: "Did you mean {word}?",
  whichLanguage: "Which language would you like to use?",
  langEn: "English",
  langHi: "Hindi",
  langOr: "Odia",
  heardNothing: "I didn't hear anything. You can try again.",
  voiceStopped: "Voice input stopped.",
  offlineBanner: "Offline — guided voice commands still work.",
  voiceRepeat: "Repeat",
  voiceEndSession: "End session",
  voiceNoMic: "Speech recognition is not available in this browser. Type below or use the buttons — everything works without a microphone.",
  voiceConfirmPrompt: "Please confirm",
  voiceTypeHint: "Type what you need…",
  voiceSend: "Send",
  voiceLanguage: "Language",
  voicePrivacyNote: "Voice stays on this device. Nothing is stored or sent except through your own secure connection.",
  voiceTimeJustNow: "just now",
  voiceTimeMinutes: "{count} minute(s) ago",
  voiceTimeHours: "{count} hour(s) ago",
  voiceTimeDays: "{count} day(s) ago",
  voiceStateIdle: "Ready",
  voiceStateExecuting: "Working…",
  voiceStateClarify: "Please clarify",
  voiceStateError: "Something went wrong",
  voiceStateFallback: "Use the buttons below",
  voiceStateEnding: "Ending…",
  respDoctorRequested: "Your care request has been sent. A clinician will respond in the app.",

  respHelp:
    "You can check symptoms, find a doctor, check medicine availability, or open your Health Card.",
  respUnknown: "I didn't understand that. Try one of the options below.",
  respRepeatUnavailable: "There is nothing to repeat yet.",
  respClarifySymptom: "I could not clearly understand the symptom.",
  respSymptomsUnderstood: "I understood: {symptoms}.",
  respTriageExplain:
    "The symptom checker organizes your symptoms and urgency. It does not diagnose illness.",
  respOfflineExplain:
    "You are offline. Saved information stays available, and new requests wait for a connection.",
  respSyncExplain: "Offline actions sync automatically when you reconnect.",
  respDoctorAskLanguage: "Which language would you prefer?",
  respDoctorFound:
    "I found {count} doctors who speak {language}. Would you like to see them?",
  respDoctorNone: "I could not find an available doctor right now.",
  respDoctorStatus:
    "You have {count} care request(s). Latest status: {status}.",
  respConfirmDoctor: "Would you like me to request a doctor?",
  respMedicineFound:
    "{pharmacy} reports {medicine} as {status}, last confirmed {time}.",
  respMedicineNone: "I could not find availability information for {medicine}.",
  respMedicineStale: "The last availability confirmation was {time}.",
  respHealthCardUpdated: "Your Health Card was last updated {time}.",
  respHealthCardStale:
    "This health information was last updated {time}. Some information may have changed.",
  respHealthCardEmpty: "I don't have a saved health card for you.",
  respMedicinesList: "Your current medicines: {list}.",
  respNoMedicines: "I don't have a saved medication record for you.",
  respShareConfirm:
    "Do you want to share your current medicines and allergies with the doctor?",
  respConfirmConsultation: "Would you like to start a consultation?",
  respSwitchedAudio: "Switched to audio.",
  respConfirmEnd: "Do you want to end the consultation?",
  respOfflineQueue:
    "You are offline. I can save the request on this device and send it when you reconnect. Do you want to continue?",
  respMicDenied: "Microphone access was denied. You can use the buttons instead.",
  respMicUnavailable:
    "Voice input is not available in this browser. You can use the buttons instead.",
  respRecognitionFailed: "I couldn't hear that clearly. Please try again.",
  respAiUnavailable:
    "Language understanding is unavailable right now. Use the buttons or try again.",
  respNetworkWeak:
    "Your internet is weak. Voice guidance can continue, but live availability may be delayed.",
  respLanguageChanged: "Language changed to {language}.",
  respCancelled: "Cancelled.",
  respEnded: "Voice session ended. Tap the microphone to start again.",
  respActionFailed: "That action could not be completed. Please try again.",
  respUnauthorized: "You don't have permission for that action.",
  respDuplicate: "Already done — I won't repeat that request.",
  respConsultationStarted: "Starting your consultation…",
  respConsultationAudio: "Opening the consultation for audio…",
  respConsultationEnding:
    "Opening the consultation — tap End there to finish it.",
  voiceCareStatusDraft: "draft",
  voiceCareStatusSubmitted: "submitted",
  voiceCareStatusProcessing: "processing",
  voiceCareStatusCompleted: "completed",
};

const hi: VoiceDict = {
  assistantTitle: "हेल्थफ़ोलियो से बात करें",
  assistantGreeting: "मैं आपकी कैसे मदद कर सकता हूँ?",
  micTap: "बोलने के लिए टैप करें",
  listening: "सुन रहे हैं…",
  understanding: "समझ रहे हैं…",
  speaking: "बोल रहे हैं…",
  waiting: "आपके जवाब की प्रतीक्षा में…",
  tryAgain: "दोबारा कोशिश करें",
  cancel: "रद्द करें",
  stop: "रोकें",
  confirm: "पुष्टि करें",
  yes: "हाँ",
  no: "नहीं",
  notSure: "पता नहीं",
  voiceUnavailable: "आवाज़ इनपुट उपलब्ध नहीं — बटन इस्तेमाल करें",
  internetUnavailable: "इंटरनेट उपलब्ध नहीं",
  youSaid: "आपने कहा:",
  correct: "सही है",
  retry: "दोबारा",
  quickSymptoms: "लक्षण",
  quickDoctor: "डॉक्टर",
  quickMedicine: "दवा",
  quickHealthCard: "हेल्थ कार्ड",
  sessionEnded: "आवाज़ सत्र समाप्त। फिर शुरू करने के लिए माइक्रोफ़ोन टैप करें।",
  sessionTimeout: "विलंब के बाद आवाज़ सत्र समाप्त। फिर शुरू करने के लिए माइक्रोफ़ोन टैप करें।",
  didYouMean: "क्या आपका मतलब {word} से है?",
  whichLanguage: "आप कौन सी भाषा इस्तेमाल करना चाहेंगे?",
  langEn: "अंग्रेज़ी",
  langHi: "हिंदी",
  langOr: "उड़िया",
  heardNothing: "मैंने कुछ नहीं सुना। आप दोबारा कोशिश कर सकते हैं।",
  voiceStopped: "आवाज़ इनपुट रुक गया।",
  offlineBanner: "ऑफ़लाइन — गाइडेड आवाज़ कमांड अभी भी चलते हैं।",
  voiceRepeat: "दोहराएँ",
  voiceEndSession: "सत्र समाप्त करें",
  voiceNoMic: "इस ब्राउज़र में स्पीच रिकग्निशन उपलब्ध नहीं है। नीचे टाइप करें या बटन इस्तेमाल करें — बिना माइक्रोफ़ोन के सब काम करता है।",
  voiceConfirmPrompt: "कृपया पुष्टि करें",
  voiceTypeHint: "अपनी ज़रूरत टाइप करें…",
  voiceSend: "भेजें",
  voiceLanguage: "भाषा",
  voicePrivacyNote: "आवाज़ इसी डिवाइस पर रहती है। आपके अपने सुरक्षित कनेक्शन के अलावा कुछ भी स्टोर या भेजा नहीं जाता।",
  voiceTimeJustNow: "अभी",
  voiceTimeMinutes: "{count} मिनट पहले",
  voiceTimeHours: "{count} घंटे पहले",
  voiceTimeDays: "{count} दिन पहले",
  voiceStateIdle: "तैयार",
  voiceStateExecuting: "काम हो रहा है…",
  voiceStateClarify: "कृपया स्पष्ट करें",
  voiceStateError: "कुछ गलत हुआ",
  voiceStateFallback: "नीचे के बटन इस्तेमाल करें",
  voiceStateEnding: "समाप्त हो रहा है…",
  respDoctorRequested: "आपका केयर अनुरोध भेज दिया गया है। क्लिनिशियन ऐप में जवाब देंगे।",

  respHelp:
    "आप लक्षण जाँच सकते हैं, डॉक्टर खोज सकते हैं, दवा की उपलब्धता जाँच सकते हैं, या अपना हेल्थ कार्ड खोल सकते हैं।",
  respUnknown: "मुझे वह समझ नहीं आया। नीचे कोई विकल्प चुनें।",
  respRepeatUnavailable: "दोहराने के लिए कुछ नहीं है।",
  respClarifySymptom: "मुझे लक्षण स्पष्ट समझ नहीं आया।",
  respSymptomsUnderstood: "मैंने समझा: {symptoms}।",
  respTriageExplain:
    "लक्षण चेकर आपके लक्षणों और जल्दबाज़ी को क्रम में रखता है। यह बीमारी का निदान नहीं करता।",
  respOfflineExplain:
    "आप ऑफ़लाइन हैं। सहेजी जानकारी उपलब्ध रहती है, और नए अनुरोध कनेक्शन की प्रतीक्षा करते हैं।",
  respSyncExplain: "ऑफ़लाइन कार्य कनेक्ट होने पर अपने-आप सिंक होते हैं।",
  respDoctorAskLanguage: "आप कौन सी भाषा पसंद करेंगे?",
  respDoctorFound:
    "मुझे {language} बोलने वाले {count} डॉक्टर मिले। क्या आप उन्हें देखना चाहेंगे?",
  respDoctorNone: "मुझे अभी कोई उपलब्ध डॉक्टर नहीं मिला।",
  respDoctorStatus:
    "आपके {count} केयर अनुरोध हैं। नवीनतम स्थिति: {status}।",
  respConfirmDoctor: "क्या आप चाहते हैं कि मैं डॉक्टर का अनुरोध करूँ?",
  respMedicineFound:
    "{pharmacy} ने {medicine} को {status} बताया, अंतिम पुष्टि {time}।",
  respMedicineNone: "मुझे {medicine} की उपलब्धता की जानकारी नहीं मिली।",
  respMedicineStale: "अंतिम उपलब्धता पुष्टि {time} हुई थी।",
  respHealthCardUpdated: "आपका हेल्थ कार्ड अंतिम बार {time} अपडेट हुआ।",
  respHealthCardStale:
    "यह स्वास्थ्य जानकारी अंतिम बार {time} अपडेट हुई। कुछ जानकारी बदल सकती है।",
  respHealthCardEmpty: "मेरे पास आपका कोई सहेजा हुआ हेल्थ कार्ड नहीं है।",
  respMedicinesList: "आपकी चल रही दवाइयाँ: {list}।",
  respNoMedicines: "मेरे पास आपका कोई सहेजा दवा रिकॉर्ड नहीं है।",
  respShareConfirm:
    "क्या आप अपनी चल रही दवाइयाँ और एलर्जी डॉक्टर के साथ साझा करना चाहते हैं?",
  respConfirmConsultation: "क्या आप परामर्श शुरू करना चाहते हैं?",
  respSwitchedAudio: "ऑडियो पर स्विच किया गया।",
  respConfirmEnd: "क्या आप परामर्श समाप्त करना चाहते हैं?",
  respOfflineQueue:
    "आप ऑफ़लाइन हैं। मैं अनुरोध इस डिवाइस पर सहेज सकता हूँ और कनेक्ट होने पर भेज सकता हूँ। क्या आप ऐसा करना चाहते हैं?",
  respMicDenied: "माइक्रोफ़ोन अक्सेस अस्वीकृत हुआ। आप बटन इस्तेमाल कर सकते हैं।",
  respMicUnavailable:
    "इस ब्राउज़र में आवाज़ इनपुट उपलब्ध नहीं है। आप बटन इस्तेमाल कर सकते हैं।",
  respRecognitionFailed: "मुझे वह स्पष्ट नहीं सुनाई। कृपया दोबारा कोशिश करें।",
  respAiUnavailable:
    "भाषा समझने की सुविधा अभी उपलब्ध नहीं है। बटन इस्तेमाल करें या दोबारा कोशिश करें।",
  respNetworkWeak:
    "आपका इंटरनेट कमज़ोर है। आवाज़ मार्गदर्शन जारी रह सकता है, लेकिन लाइव उपलब्धता देरी से आ सकती है।",
  respLanguageChanged: "भाषा {language} बदल दी गई।",
  respCancelled: "रद्द किया गया।",
  respEnded: "आवाज़ सत्र समाप्त। फिर शुरू करने के लिए माइक्रोफ़ोन टैप करें।",
  respActionFailed: "वह कार्य पूरा नहीं हो सका। कृपया दोबारा कोशिश करें।",
  respUnauthorized: "आपके पास वह कार्य करने की अनुमति नहीं है।",
  respDuplicate: "पहले ही हो गया — मैं वह अनुरोध दोहराऊँगा नहीं।",
  respConsultationStarted: "आपका परामर्श शुरू हो रहा है…",
  respConsultationAudio: "ऑडियो के लिए परामर्श खोला जा रहा है…",
  respConsultationEnding:
    "परामर्श खोला जा रहा है — वहाँ End टैप करने पर समाप्त होगा।",
  voiceCareStatusDraft: "ड्राफ़्ट",
  voiceCareStatusSubmitted: "जमा किया गया",
  voiceCareStatusProcessing: "प्रोसेसिंग",
  voiceCareStatusCompleted: "पूरा हुआ",
};

const or: VoiceDict = {
  assistantTitle: "ହେଲ୍ଥଫୋଲିଓ ସହ କଥା କରନ୍ତୁ",
  assistantGreeting: "ମୁଁ ଆପଣଙ୍କୁ କେମିତି ସାହାଯ୍ୟ କରିପାରିବ?",
  micTap: "କହିବାକୁ ଟାପ୍ କରନ୍ତୁ",
  listening: "ଶୁଣୁଛି…",
  understanding: "ବୁଝୁଛି…",
  speaking: "କହୁଛି…",
  waiting: "ଆପଣଙ୍କ ଉତ୍ତର ଅପେକ୍ଷାରେ…",
  tryAgain: "ପୁଣି ଚେଷ୍ଟା କରନ୍ତୁ",
  cancel: "ବନ୍ଦ କରନ୍ତୁ",
  stop: "ରୋକନ୍ତୁ",
  confirm: "ନିଶ୍ଚିତ କରନ୍ତୁ",
  yes: "ହଁ",
  no: "ନା",
  notSure: "ଜଣା ନାହିଁ",
  voiceUnavailable: "ଭଏସ୍ ଇନପୁଟ୍ ଉପଲବ୍ଧ ନାହିଁ — ବଟନ୍ ବ୍ୟବହାର କରନ୍ତୁ",
  internetUnavailable: "ଇଣ୍ଟରନେଟ୍ ଉପଲବ୍ଧ ନାହିଁ",
  youSaid: "ଆପଣ କହିଲେ:",
  correct: "ଠିକ୍ ଅଛି",
  retry: "ପୁଣି",
  quickSymptoms: "ଲକ୍ଷଣ",
  quickDoctor: "ଡାକ୍ତର",
  quickMedicine: "ଔଷଧ",
  quickHealthCard: "ସ୍ୱାସ୍ଥ୍ୟ କାର୍ଡ",
  sessionEnded: "ଭଏସ୍ ସେସନ୍ ସମାପ୍ତ। ପୁଣି ଆରମ୍ଭ କରିବାକୁ ମାଇକ୍ରୋଫୋନ୍ ଟାପ୍ କରନ୍ତୁ।",
  sessionTimeout: "ବିଳମ୍ବ ପରେ ଭଏସ୍ ସେସନ୍ ସମାପ୍ତ। ପୁଣି ଆରମ୍ଭ କରିବାକୁ ମାଇକ୍ରୋଫୋନ୍ ଟାପ୍ କରନ୍ତୁ।",
  didYouMean: "ଆପଣଙ୍କ ମତ {word} ବୋଲି ଥିଲା କି?",
  whichLanguage: "ଆପଣ କେଉଁ ଭାଷା ବ୍ୟବହାର କରିବାକୁ ଚାହୁଁଛନ୍ତି?",
  langEn: "ଅଙ୍ଗ୍ରେଜୀ",
  langHi: "ହିନ୍ଦୀ",
  langOr: "ଉଡ଼ିଆ",
  heardNothing: "ମୁଁ କିଛି ଶୁଣିନାହିଁ। ଆପଣ ପୁଣି ଚେଷ୍ଟା କରିପାରିବେ।",
  voiceStopped: "ଭଏସ୍ ଇନପୁଟ୍ ବନ୍ଦ ହେଲା।",
  offlineBanner: "ଅଫଲାଇନ୍ — ଗାଇଡେଡ୍ ଭଏସ୍ କମାଣ୍ଡ ଏବେ ମଧ୍ୟ ଚାଲେ।",
  voiceRepeat: "ପୁଣି କହନ୍ତୁ",
  voiceEndSession: "ସେସନ୍ ସମାପ୍ତ କରନ୍ତୁ",
  voiceNoMic: "ଏହି ବ୍ରାଉଜର୍ରେ ସ୍ପିଚ୍ ରିକଗ୍ନିସନ୍ ନାହିଁ। ତଳେ ଟାଇପ୍ କରନ୍ତୁ ବା ବଟନ ବ୍ୟବହାର କରନ୍ତୁ — ମାଇକ୍ରୋଫୋନ୍ ବିନା ସବୁ କାମ ହୁଏ।",
  voiceConfirmPrompt: "ଦୟାକରି ନିଶ୍ଚିତ କରନ୍ତୁ",
  voiceTypeHint: "ଆପଣ କ'ଣ ଚାହୁଁଛନ୍ତି ଟାଇପ୍ କରନ୍ତୁ…",
  voiceSend: "ପଠାନ୍ତୁ",
  voiceLanguage: "ଭାଷା",
  voicePrivacyNote: "ଆହୁରି ଏହି ଡିଭାଇସ୍ରେ ରହେ। ଆପଣଙ୍କ ନିଜ ସୁରକ୍ଷିତ କନେକ୍ସନ୍ ବ୍ୟତୀତ କିଛି ସ୍ଟର୍ ବା ପଠାଯାଏ ନାହିଁ।",
  voiceTimeJustNow: "ଏବେ",
  voiceTimeMinutes: "{count} ମିନିଟ୍ ପୂର୍ବେ",
  voiceTimeHours: "{count} ଘଣ୍ଟା ପୂର୍ବେ",
  voiceTimeDays: "{count} ଦିନ ପୂର୍ବେ",
  voiceStateIdle: "ତିଆରି",
  voiceStateExecuting: "କାମ ହୁଏଛି…",
  voiceStateClarify: "ଦୟାକରି ସ୍ପଷ୍ଟ କରନ୍ତୁ",
  voiceStateError: "କିଛି ଭୁଲ ହୋଇଛି",
  voiceStateFallback: "ତଳେ ଥିବା ବଟନ ବ୍ୟବହାର କରନ୍ତୁ",
  voiceStateEnding: "ସମାପ୍ତ ହୁଏଛି…",
  respDoctorRequested: "ଆପଣଙ୍କ କେଅ ରିକ୍ୱେସ୍ଟ୍ ପଠାଯାଇଛି। କ୍ଲିନିସିଆନ୍ ଆପ୍ରେ ଉତ୍ତର ଦେବେ।",

  respHelp:
    "ଆପଣ ଲକ୍ଷଣ ଯାଞ୍ଚ କରିପାରିବେ, ଡାକ୍ତର ଖୋଜ କରିପାରିବେ, ଔଷଧ ଉପଲବ୍ଧତା ଯାଞ୍ଚ କରିପାରିବେ, କିମ୍ବା ନିଜ ସ୍ୱାସ୍ଥ୍ୟ କାର୍ଡ ଖୋଲିପାରିବେ।",
  respUnknown: "ମୁଁ ସେଟି ବୁଝିପାରିଲି ନାହିଁ। ତଳେ ଗୋଟିଏ ବିକଳ୍ପ ବାଛନ୍ତୁ।",
  respRepeatUnavailable: "ପୁଣି କହିବାକୁ କିଛି ନାହିଁ।",
  respClarifySymptom: "ମୁଁ ଲକ୍ଷଣ ସ୍ପଷ୍ଟ ବୁଝିପାରିଲି ନାହିଁ।",
  respSymptomsUnderstood: "ମୁଁ ବୁଝିଲି: {symptoms}।",
  respTriageExplain:
    "ଲକ୍ଷଣ ଚେକର ଆପଣଙ୍କ ଲକ୍ଷଣ ଓ ଜରୁରୀପନକ୍ରମ କ୍ରମରେ ରଖେ। ଏହା ରୋଗ ନିର୍ଣ୍ଣୟ କରେ ନାହିଁ।",
  respOfflineExplain:
    "ଆପଣ ଅଫଲାଇନ୍ ଅଛନ୍ତି। ସଂରକ୍ଷିତ ସୂଚନା ଉପଲବ୍ଧ ରହେ, ନୂତନ ଅନୁରୋଧ ସଂଯୋଗ ଅପେକ୍ଷା କରେ।",
  respSyncExplain: "ଅଫଲାଇନ୍ କାର୍ଯ୍ୟ ପୁଣି ସଂଯୋଗ ହେଲେ ସ୍ୱୟଂକ୍ରିୟ ସିଙ୍କ ହୁଏ।",
  respDoctorAskLanguage: "ଆପଣ କେଉଁ ଭାଷା ପସନ୍ଦ କରିବେ?",
  respDoctorFound:
    "ମୁଁ {language} କହୁଥିବା {count} ଜଣ ଡାକ୍ତର ମିଳିଲା। ଆପଣ ଉନ୍ହାଙ୍କୁ ଦେଖିବାକୁ ଚାହୁଁଛନ୍ତି କି?",
  respDoctorNone: "ମୁଁ ଏବେ କୌଣସି ଉପଲବ୍ଧ ଡାକ୍ତର ମିଳିଲା ନାହିଁ।",
  respDoctorStatus:
    "ଆପଙ୍କ ପାଖରେ {count} ଟି କେଅର ଅନୁରୋଧ ଅଛି। ନୂତନ ସ୍ଥିତି: {status}।",
  respConfirmDoctor: "ଆପଣ ଚାହୁଁଛନ୍ତି ମୁଁ ଗୋଟିଏ ଡାକ୍ତର ଅନୁରୋଧ କରୁ କି?",
  respMedicineFound:
    "{pharmacy} ଠାରେ {medicine} କୁ {status} ବୋଲି କହାଯାଇଛି, ଶେଷ ନିଶ୍ଚୟ {time}।",
  respMedicineNone: "ମୁଁ {medicine} ର ଉପଲବ୍ଧତା ସୂଚନା ମିଳିଲା ନାହିଁ।",
  respMedicineStale: "ଶେଷ ଉପଲବ୍ଧତା ନିଶ୍ଚୟ {time} ହୋଇଥିଲା।",
  respHealthCardUpdated: "ଆପଣଙ୍କ ସ୍ୱାସ୍ଥ୍ୟ କାର୍ଡ ଶେଷ ଥରେ {time} ଅପଡେଟ୍ ହୋଇଥିଲା।",
  respHealthCardStale:
    "ଏହି ସ୍ୱାସ୍ଥ୍ୟ ସୂଚନା ଶେଷ ଥରେ {time} ଅପଡେଟ୍ ହୋଇଥିଲା। କିଛି ସୂଚନା ବଦଳିପାରେ।",
  respHealthCardEmpty: "ମୋ ପାଖରେ ଆପଣଙ୍କ କୌଣସି ସଂରକ୍ଷିତ ସ୍ୱାସ୍ଥ୍ୟ କାର୍ଡ ନାହିଁ।",
  respMedicinesList: "ଆପଣଙ୍କ ଚାଲୁଥିବା ଔଷଧ: {list}।",
  respNoMedicines: "ମୋ ପାଖରେ ଆପଣଙ୍କ କୌଣସି ସଂରକ୍ଷିତ ଔଷଧ ରେକର୍ଡ ନାହିଁ।",
  respShareConfirm:
    "ଆପଣ ନିଜ ଚାଲୁଥିବା ଔଷଧ ଓ ଏଲର୍ଜି ଡାକ୍ତରଙ୍କ ସହ ସାଝା କରିବାକୁ ଚାହୁଁଛନ୍ତି କି?",
  respConfirmConsultation: "ଆପଣ ପରାମର୍ଶ ଆରମ୍ଭ କରିବାକୁ ଚାହୁଁଛନ୍ତି କି?",
  respSwitchedAudio: "ଅଡିଓରେ ସ୍ୱିଚ୍ ହେଲା।",
  respConfirmEnd: "ଆପଣ ପରାମର୍ଶ ସମାପ୍ତ କରିବାକୁ ଚାହୁଁଛନ୍ତି କି?",
  respOfflineQueue:
    "ଆପଣ ଅଫଲାଇନ୍ ଅଛନ୍ତି। ମୁଁ ଅନୁରୋଧ ଏହି ଡିଭାଇସରେ ସଂରକ୍ଷଣ କରି ସଂଯୋଗ ହେଲେ ପଠାଇପାରିବ। ଆପଣ ଏହା କରିବାକୁ ଚାହୁଁଛନ୍ତି କି?",
  respMicDenied: "ମାଇକ୍ରୋଫୋନ୍ ଅକ୍ସେସ୍ ଅସ୍ୱୀକୃତ ହେଲା। ଆପଣ ବଟନ୍ ବ୍ୟବହାର କରିପାରିବେ।",
  respMicUnavailable:
    "ଏହି ବ୍ରାଉଜରରେ ଭଏସ୍ ଇନପୁଟ୍ ଉପଲବ୍ଧ ନାହିଁ। ଆପଣ ବଟନ୍ ବ୍ୟବହାର କରିପାରିବେ।",
  respRecognitionFailed: "ମୁଁ ସେଟି ସ୍ପଷ୍ଟ ଶୁଣିପାରିଲି ନାହିଁ। ଦୟାକରି ପୁଣି ଚେଷ୍ଟା କରନ୍ତୁ।",
  respAiUnavailable:
    "ଭାଷା ବୁଝିବା ସୁବିଧା ଏବେ ଉପଲବ୍ଧ ନାହିଁ। ବଟନ୍ ବ୍ୟବହାର କରନ୍ତୁ କିମ୍ବା ପୁଣି ଚେଷ୍ଟା କରନ୍ତୁ।",
  respNetworkWeak:
    "ଆପଣଙ୍କ ଇଣ୍ଟରନେଟ୍ ଦୁର୍ବଳ। ଭଏସ୍ ମାର୍ଗଦର୍ଶନ ଜାରି ରହିପାରେ, କିନ୍ତୁ ଲାଇଭ୍ ଉପଲବ୍ଧତା ବିଳମ୍ବରେ ଆପାରେ।",
  respLanguageChanged: "ଭାଷା {language} ରେ ବଦଳ ହେଲା।",
  respCancelled: "ବନ୍ଦ ହେଲା।",
  respEnded: "ଭଏସ୍ ସେସନ୍ ସମାପ୍ତ। ପୁଣି ଆରମ୍ଭ କରିବାକୁ ମାଇକ୍ରୋଫୋନ୍ ଟାପ୍ କରନ୍ତୁ।",
  respActionFailed: "ସେହି କାର୍ଯ୍ୟ ସମ୍ପୂର୍ଣ୍ଣ ହୋଇପାରିଲା ନାହିଁ। ଦୟାକରି ପୁଣି ଚେଷ୍ଟା କରନ୍ତୁ।",
  respUnauthorized: "ଆପଣଙ୍କ ପାଖରେ ସେହି କାର୍ଯ୍ୟ ପାଇଁ ଅନୁମତି ନାହିଁ।",
  respDuplicate: "ପୂର୍ବରୁ ହୋଇଛି — ମୁଁ ସେହି ଅନୁରୋଧ ପୁଣି କରିବ ନାହିଁ।",
  respConsultationStarted: "ଆପଣଙ୍କ ପରାମର୍ଶ ଆରମ୍ଭ ହେଉଛି…",
  respConsultationAudio: "ଅଡିଓ ପାଇଁ ପରାମର୍ଶ ଖୋଲା ଯାଉଛି…",
  respConsultationEnding:
    "ପରାମର୍ଶ ଖୋଲା ଯାଉଛି — ସେଠାରେ End ଟିପିଲେ ସମାପ୍ତ ହେବ।",
  voiceCareStatusDraft: "ଖସରା",
  voiceCareStatusSubmitted: "ଜମା ହୋଇଛି",
  voiceCareStatusProcessing: "କାର୍ଯ୍ୟକରୁଛି",
  voiceCareStatusCompleted: "ସମ୍ପୂର୍ଣ୍ଣ ହୋଇଛି",
};

const DICTS: Record<Language, VoiceDict> = { en, hi, or };

/** Look up a voice string; falls back through language → English → key. */
export function tVoice(
  language: Language,
  key: keyof VoiceDict,
  vars?: Record<string, string>
): string {
  const dict = DICTS[language] ?? en;
  let text = dict[key] ?? en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replaceAll(`{${k}}`, v);
    }
  }
  return text;
}

/** All keys present in every language (parity helper for tests). */
export const VOICE_DICT_KEYS = Object.keys(en) as (keyof VoiceDict)[];
