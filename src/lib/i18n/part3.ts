/**
 * Part 3 interface strings — care coordination, appointments, consent,
 * secure text, and consultation lobby. Patient-facing wording is plain,
 * honest, and jargon-free. Same fallback contract as part2: language →
 * English → key.
 */

import type { Language } from "./index";

export interface Part3Dict {
  statusHeading: string;
  statusLabel: string;
  statusAwaitingReview: string;
  statusAssigned: string;
  statusAccepted: string;
  statusProposed: string;
  statusConfirmed: string;
  statusInConsultation: string;
  statusCompleted: string;
  statusCancelled: string;
  statusDeclined: string;
  statusNeedsAttention: string;
  statusQueuedOffline: string;

  careOptionsHeading: string;
  careOptionsLabel: string;
  careOptionsNone: string;
  careOptionsNoneHint: string;
  clinicianSpecialty: string;
  clinicianLanguages: string;
  clinicianModes: string;
  modeText: string;
  modeAudio: string;
  modeVideo: string;
  updatedJustNow: string;
  updatedMinutesAgo: string;
  freshnessStale: string;

  requestCare: string;
  proposeAppointment: string;
  proposedTime: string;
  confirmAppointment: string;
  declineProposal: string;
  patientAckNote: string;

  consentHeading: string;
  consentExplanation: string;
  consentGrant: string;
  consentRevoke: string;
  consentRevoked: string;
  consentSelectedRecords: string;

  messagesHeading: string;
  messagePlaceholder: string;
  messageSend: string;
  messageSavedLocally: string;
  messageSending: string;
  messageDelivered: string;
  messageFailed: string;
  messagesEmpty: string;
  noSeenClaims: string;

  lobbyHeading: string;
  joinConsultation: string;
  connecting: string;
  connected: string;
  reconnecting: string;
  switchedToAudio: string;
  switchedToText: string;
  connectionFailed: string;
  mute: string;
  unmute: string;
  cameraOn: string;
  cameraOff: string;
  endConsultation: string;
  continueByText: string;
  sendVoiceNote: string;
  tryAudioOnly: string;
  bandwidthHint: string;
  permissionDenied: string;
  realtimeUnavailable: string;

  staffNotConfigured: string;
  staffNotConfiguredHint: string;

  // Platform-admin staff console (secure role management)
  adminConsoleTitle: string;
  adminConsoleSubtitle: string;
  adminNoAccess: string;
  adminNoAccessHint: string;
  adminRolesHeading: string;
  adminAssignHeading: string;
  adminAssignUserId: string;
  adminAssignRole: string;
  adminAssignScope: string;
  adminAssignScopeHint: string;
  adminAssignSubmit: string;
  adminRoleUser: string;
  adminRoleStatus: string;
  adminActionSuspend: string;
  adminActionReinstate: string;
  adminActionRevoke: string;
  adminConfirmRevoke: string;
  adminEmpty: string;
  adminAuditHeading: string;
  adminAuditEmpty: string;
  adminSaved: string;

  availabilityControls: string;
  assignedQueue: string;
  unassignedQueue: string;
  facilityOverview: string;

  errorGeneric: string;
}

const en: Part3Dict = {
  statusHeading: "Request status",
  statusLabel: "Status",
  statusAwaitingReview: "Waiting for a care team to review",
  statusAssigned: "A care team member has been assigned",
  statusAccepted: "Your request has been accepted",
  statusProposed: "An appointment has been proposed",
  statusConfirmed: "Appointment confirmed",
  statusInConsultation: "In consultation",
  statusCompleted: "Completed",
  statusCancelled: "Cancelled",
  statusDeclined: "The care team could not take this request",
  statusNeedsAttention: "Needs attention",
  statusQueuedOffline: "Saved on this device",

  careOptionsHeading: "Available care team",
  careOptionsLabel: "Available options",
  careOptionsNone:
    "No participating clinician is available right now. Your request remains saved and can be reviewed when a clinician becomes available.",
  careOptionsNoneHint: "You do not need to do anything. We keep your request safe.",
  clinicianSpecialty: "Service area",
  clinicianLanguages: "Languages",
  clinicianModes: "Consultation ways",
  modeText: "Text messages",
  modeAudio: "Audio call",
  modeVideo: "Video call",
  updatedJustNow: "Updated just now",
  updatedMinutesAgo: "Updated {count} minutes ago",
  freshnessStale: "Availability information is being refreshed",

  requestCare: "Request care",
  proposeAppointment: "Propose an appointment",
  proposedTime: "Proposed time",
  confirmAppointment: "Confirm appointment",
  declineProposal: "Decline proposal",
  patientAckNote: "You confirm this time yourself. Nothing is booked without you.",

  consentHeading: "Share your records",
  consentExplanation:
    "Only the selected records will be shared with the assigned care team for this request.",
  consentGrant: "I agree to share these records",
  consentRevoke: "Stop future sharing",
  consentRevoked: "Sharing stopped",
  consentSelectedRecords: "Selected records",

  messagesHeading: "Secure messages",
  messagePlaceholder: "Write a short message…",
  messageSend: "Send",
  messageSavedLocally: "Saved on this device",
  messageSending: "Sending…",
  messageDelivered: "Delivered",
  messageFailed: "Not sent yet — will retry",
  messagesEmpty: "No messages yet. Messages are private between you and your care team.",
  noSeenClaims: "This app does not show \"seen\" receipts.",

  lobbyHeading: "Consultation",
  joinConsultation: "Join",
  connecting: "Connecting…",
  connected: "Connected",
  reconnecting: "Reconnecting…",
  switchedToAudio: "Switched to audio",
  switchedToText: "Switched to text",
  connectionFailed: "Connection failed",
  mute: "Mute microphone",
  unmute: "Unmute microphone",
  cameraOn: "Turn camera on",
  cameraOff: "Turn camera off",
  endConsultation: "End consultation",
  continueByText: "Continue by secure text",
  sendVoiceNote: "Send a short voice note",
  tryAudioOnly: "Try audio only",
  bandwidthHint: "On a slow connection, text messages work best.",
  permissionDenied: "Microphone or camera permission was not given. You can continue by text.",
  realtimeUnavailable:
    "Live audio/video is not available right now. Secure text messages are fully available.",

  staffNotConfigured: "Staff access is not configured",
  staffNotConfiguredHint:
    "This view is for participating clinicians and facility coordinators. No staff account is configured on this device.",

  adminConsoleTitle: "Staff administration",
  adminConsoleSubtitle:
    "Assign and manage staff roles. Every action is authorized on the server and recorded in the audit history.",
  adminNoAccess: "Platform administrator access is not configured for this account",
  adminNoAccessHint:
    "Roles can only be managed by an existing platform administrator. Ask your deployment administrator to provision access with the local staff bootstrap command.",
  adminRolesHeading: "Current staff roles",
  adminAssignHeading: "Assign a role to an existing user",
  adminAssignUserId: "User ID (UUID)",
  adminAssignRole: "Role",
  adminAssignScope: "Facility or pharmacy ID",
  adminAssignScopeHint: "Required for clinician, coordinator, and pharmacy roles.",
  adminAssignSubmit: "Assign role",
  adminRoleUser: "User",
  adminRoleStatus: "Status",
  adminActionSuspend: "Suspend",
  adminActionReinstate: "Reinstate",
  adminActionRevoke: "Revoke",
  adminConfirmRevoke: "Revoke this role? The person loses staff access immediately.",
  adminEmpty: "No staff roles have been assigned yet.",
  adminAuditHeading: "Recent administrative actions",
  adminAuditEmpty: "No administrative actions recorded yet.",
  adminSaved: "Role updated.",
  availabilityControls: "My availability",
  assignedQueue: "Assigned care requests",
  unassignedQueue: "Unassigned requests",
  facilityOverview: "Facility availability",

  errorGeneric: "Something did not work. Your information is safe on this device.",
};

const hi: Part3Dict = {
  statusHeading: "अनुरोध की स्थिति",
  statusLabel: "स्थिति",
  statusAwaitingReview: "देखभाल टीम की समीक्षा की प्रतीक्षा में",
  statusAssigned: "देखभाल टीम का एक सदस्य नियुक्त किया गया",
  statusAccepted: "आपका अनुरोध स्वीकार कर लिया गया",
  statusProposed: "एक समय का सुझाव दिया गया है",
  statusConfirmed: "अपॉइंटमेंट पक्का हो गया",
  statusInConsultation: "परामर्श चल रहा है",
  statusCompleted: "पूरा हुआ",
  statusCancelled: "रद्द",
  statusDeclined: "देखभाल टीम यह अनुरोध नहीं ले सकी",
  statusNeedsAttention: "ध्यान देने की ज़रूरत",
  statusQueuedOffline: "इस डिवाइस पर सहेजा गया",

  careOptionsHeading: "उपलब्ध देखभाल टीम",
  careOptionsLabel: "उपलब्ध विकल्प",
  careOptionsNone:
    "अभी कोई सहभागी चिकित्सक उपलब्ध नहीं है। आपका अनुरोध सुरक्षित सहेजा गया है और चिकित्सक उपलब्ध होने पर देखा जाएगा।",
  careOptionsNoneHint: "आपको कुछ करने की ज़रूरत नहीं। हम आपका अनुरोध सुरक्षित रखते हैं।",
  clinicianSpecialty: "सेवा क्षेत्र",
  clinicianLanguages: "भाषाएँ",
  clinicianModes: "परामर्श के तरीके",
  modeText: "लिखित संदेश",
  modeAudio: "ऑडियो कॉल",
  modeVideo: "वीडियो कॉल",
  updatedJustNow: "अभी अपडेट हुआ",
  updatedMinutesAgo: "{count} मिनट पहले अपडेट हुआ",
  freshnessStale: "उपलब्धता की जानकारी ताज़ा हो रही है",

  requestCare: "देखभाल का अनुरोध करें",
  proposeAppointment: "समय का सुझाव दें",
  proposedTime: "सुझाया समय",
  confirmAppointment: "अपॉइंटमेंट पक्का करें",
  declineProposal: "सुझाव ठुकराएँ",
  patientAckNote: "यह समय आप स्वयं पक्का करते हैं। आपके बिना कुछ बुक नहीं होता।",

  consentHeading: "अपने रिकॉर्ड साझा करें",
  consentExplanation:
    "केवल चुने गए रिकॉर्ड ही इस अनुरोध के लिए नियुक्त देखभाल टीम से साझा किए जाएँगे।",
  consentGrant: "मैं ये रिकॉर्ड साझा करने को सहमत हूँ",
  consentRevoke: "आगे की साझेदारी रोकें",
  consentRevoked: "साझेदारी रोक दी गई",
  consentSelectedRecords: "चुने गए रिकॉर्ड",

  messagesHeading: "सुरक्षित संदेश",
  messagePlaceholder: "छोटा संदेश लिखें…",
  messageSend: "भेजें",
  messageSavedLocally: "इस डिवाइस पर सहेजा गया",
  messageSending: "भेजा जा रहा है…",
  messageDelivered: "पहुँच गया",
  messageFailed: "अभी नहीं भेजा — दोबारा कोशिश होगी",
  messagesEmpty: "अभी कोई संदेश नहीं। संदेश केवल आप और आपकी देखभाल टीम के बीच होते हैं।",
  noSeenClaims: "यह ऐप \"देखा गया\" नहीं दिखाता।",

  lobbyHeading: "परामर्श",
  joinConsultation: "जुड़ें",
  connecting: "जुड़ रहा है…",
  connected: "जुड़ गया",
  reconnecting: "फिर जुड़ रहा है…",
  switchedToAudio: "ऑडियो पर बदल गया",
  switchedToText: "लिखित पर बदल गया",
  connectionFailed: "कनेक्शन नाकाम",
  mute: "माइक बंद करें",
  unmute: "माइक चालू करें",
  cameraOn: "कैमरा चालू करें",
  cameraOff: "कैमरा बंद करें",
  endConsultation: "परामर्श समाप्त करें",
  continueByText: "सुरक्षित लिखित संदेश से जारी रखें",
  sendVoiceNote: "छोटी आवाज़-टिप्पणी भेजें",
  tryAudioOnly: "केवल ऑडियो आज़माएँ",
  bandwidthHint: "धीमे कनेक्शन पर लिखित संदेश सबसे भरोसेमंद हैं।",
  permissionDenied: "माइक या कैमरे की अनुमति नहीं मिली। आप लिखित संदेश से जारी रख सकते हैं।",
  realtimeUnavailable:
    "सीधा ऑडियो/वीडियो अभी उपलब्ध नहीं है। सुरक्षित लिखित संदेश पूरी तरह उपलब्ध हैं।",

  staffNotConfigured: "स्टाफ एक्सेस कॉन्फ़िगर नहीं है",

  adminConsoleTitle: "स्टाफ प्रशासन",
  adminConsoleSubtitle:
    "स्टाफ भूमिकाएँ नियत करें और प्रबंधित करें। हर कार्य सर्वर पर अधिकृत होता है और ऑडिट इतिहास में दर्ज होता है।",
  adminNoAccess: "इस खाते के लिए प्लेटफ़ॉर्म प्रशासक एक्सेस कॉन्फ़िगर नहीं है",
  adminNoAccessHint:
    "भूमिकाएँ केवल मौजूदा प्लेटफ़ॉर्म प्रशासक ही प्रबंधित कर सकते हैं। एक्सेस देने के लिए अपने प्रशासक से स्थानीय स्टाफ बूटस्ट्रैप कमांड चलाने को कहें।",
  adminRolesHeading: "वर्तमान स्टाफ भूमिकाएँ",
  adminAssignHeading: "किसी मौजूदा उपयोगकर्ता को भूमिका नियत करें",
  adminAssignUserId: "उपयोगकर्ता आईडी (UUID)",
  adminAssignRole: "भूमिका",
  adminAssignScope: "सुविधा या फार्मेसी आईडी",
  adminAssignScopeHint: "क्लिनिशियन, कोऑर्डिनेटर और फार्मेसी भूमिकाओं के लिए आवश्यक।",
  adminAssignSubmit: "भूमिका नियत करें",
  adminRoleUser: "उपयोगकर्ता",
  adminRoleStatus: "स्थिति",
  adminActionSuspend: "निलंबित करें",
  adminActionReinstate: "पुनः बहाल करें",
  adminActionRevoke: "रद्द करें",
  adminConfirmRevoke: "क्या यह भूमिका रद्द करनी है? व्यक्ति का स्टाफ एक्सेस तुरंत समाप्त हो जाएगा।",
  adminEmpty: "अभी कोई स्टाफ भूमिका नियत नहीं की गई है।",
  adminAuditHeading: "हाल के प्रशासनिक कार्य",
  adminAuditEmpty: "अभी कोई प्रशासनिक कार्य दर्ज नहीं है।",
  adminSaved: "भूमिका अपडेट हो गई।",
  staffNotConfiguredHint:
    "यह दृश्य सहभागी चिकित्सकों और सुविधा समन्वयकों के लिए है। इस डिवाइस पर कोई स्टाफ खाता कॉन्फ़िगर नहीं है।",
  availabilityControls: "मेरी उपलब्धता",
  assignedQueue: "नियुक्त देखभाल अनुरोध",
  unassignedQueue: "बिना नियुक्त अनुरोध",
  facilityOverview: "सुविधा की उपलब्धता",

  errorGeneric: "कुछ ठीक नहीं हुआ। आपकी जानकारी इस डिवाइस पर सुरक्षित है।",
};

const or: Part3Dict = {
  statusHeading: "ଅନୁରୋଧର ସ୍ଥିତି",
  statusLabel: "ସ୍ଥିତି",
  statusAwaitingReview: "ଯତ୍ନ ଦଳଙ୍କ ସମୀକ୍ଷା ପାଇଁ ଅପେକ୍ଷା",
  statusAssigned: "ଯତ୍ନ ଦଳର ଜଣେ ସଦସ୍ୟ ନିଯୁକ୍ତ ହୋଇଛନ୍ତି",
  statusAccepted: "ଆପଣଙ୍କ ଅନୁରୋଧ ଗୃହୀତ ହୋଇଛି",
  statusProposed: "ଗୋଟିଏ ସମୟର ପରାମର୍ଶ ଦିଆଯାଇଛି",
  statusConfirmed: "ଅପଏଣ୍ଟମେଣ୍ଟ ନିଶ୍ଚିତ ହୋଇଗଲା",
  statusInConsultation: "ପରାମର୍ଶ ଚାଲୁଛି",
  statusCompleted: "ସମ୍ପୂର୍ଣ୍ଣ",
  statusCancelled: "ବାତିଲ",
  statusDeclined: "ଯତ୍ନ ଦଳ ଏହି ଅନୁରୋଧ ନେଇପାରିଲେ ନାହିଁ",
  statusNeedsAttention: "ଧ୍ୟାନ ଦେବା ଦରକାର",
  statusQueuedOffline: "ଏହି ଡିଭାଇସରେ ସଂରକ୍ଷିତ",

  careOptionsHeading: "ଉପଲବ୍ଧ ଯତ୍ନ ଦଳ",
  careOptionsLabel: "ଉପଲବ୍ଧ ବିକଳ୍ପ",
  careOptionsNone:
    "ଏବେ କୌଣସି ସହଭାଗୀ ଡାକ୍ତର ଉପଲବ୍ଧ ନାହାଁନ୍ତି। ଆପଣଙ୍କ ଅନୁରୋଧ ସୁରକ୍ଷିତ ଅଛି ଏବଂ ଡାକ୍ତର ଉପଲବ୍ଧ ହେଲେ ଦେଖାଯିବ।",
  careOptionsNoneHint: "ଆପଣ କିଛି କରିବା ଆବଶ୍ୟକ ନାହିଁ। ଆମେ ଆପଣଙ୍କ ଅନୁରୋଧ ସୁରକ୍ଷିତ ରଖୁ।",
  clinicianSpecialty: "ସେବା କ୍ଷେତ୍ର",
  clinicianLanguages: "ଭାଷାଗୁଡ଼ିକ",
  clinicianModes: "ପରାମର୍ଶର ଉପାୟ",
  modeText: "ଲେଖା ସନ୍ଦେଶ",
  modeAudio: "ଅଡିଓ କଲ୍",
  modeVideo: "ଭିଡିଓ କଲ୍",
  updatedJustNow: "ଏବେ ଅପଡେଟ୍ ହୋଇଛି",
  updatedMinutesAgo: "{count} ମିନିଟ୍ ପୂର୍ବେ ଅପଡେଟ୍ ହୋଇଛି",
  freshnessStale: "ଉପଲବ୍ଧତା ସୂଚନା ତାଜା ହେଉଛି",

  requestCare: "ଯତ୍ନ ମାଗନ୍ତୁ",
  proposeAppointment: "ସମୟ ପରାମର୍ଶ ଦିଅନ୍ତୁ",
  proposedTime: "ପରାମର୍ଶିତ ସମୟ",
  confirmAppointment: "ଅପଏଣ୍ଟମେଣ୍ଟ ନିଶ୍ଚିତ କରନ୍ତୁ",
  declineProposal: "ପରାମର୍ଶ ଅଗ୍ରାହ୍ୟ କରନ୍ତୁ",
  patientAckNote: "ଏହି ସମୟ ଆପଣ ନିଜେ ନିଶ୍ଚିତ କରନ୍ତି। ଆପଣଙ୍କ ବିନା କିଛି ବୁକ୍ ହୁଏ ନାହିଁ।",

  consentHeading: "ନିଜ ରେକର୍ଡ ସହଭାଗ କରନ୍ତୁ",
  consentExplanation:
    "ବଛା ହୋଇଥିବା ରେକର୍ଡ ହିଁ ଏହି ଅନୁରୋଧ ପାଇଁ ନିଯୁକ୍ତ ଯତ୍ନ ଦଳ ସହ ସହଭାଗ ହେବ।",
  consentGrant: "ମୁଁ ଏହି ରେକର୍ଡ ସହଭାଗ ପାଇଁ ସହମତ",
  consentRevoke: "ଭବିଷ୍ୟତ ସହଭାଗ ବନ୍ଦ କରନ୍ତୁ",
  consentRevoked: "ସହଭାଗ ବନ୍ଦ ହୋଇଗଲା",
  consentSelectedRecords: "ବଛା ହୋଇଥିବା ରେକର୍ଡ",

  messagesHeading: "ସୁରକ୍ଷିତ ସନ୍ଦେଶ",
  messagePlaceholder: "ଛୋଟ ସନ୍ଦେଶ ଲେଖନ୍ତୁ…",
  messageSend: "ପଠାନ୍ତୁ",
  messageSavedLocally: "ଏହି ଡିଭାଇସରେ ସଂରକ୍ଷିତ",
  messageSending: "ପଠାଯାଉଛି…",
  messageDelivered: "ପହଞ୍ଚିଗଲା",
  messageFailed: "ଏବେ ପଠାଯାଇନାହିଁ — ପୁଣି ଚେଷ୍ଟା ହେବ",
  messagesEmpty: "ଏବେ କୌଣସି ସନ୍ଦେଶ ନାହିଁ। ସନ୍ଦେଶ କେବଳ ଆପଣ ଓ ଆପଣଙ୍କ ଯତ୍ନ ଦଳ ମଧ୍ୟରେ ହୁଏ।",
  noSeenClaims: "ଏହି ଆପ୍ \"ଦେଖାଯାଇଛି\" ଦେଖାଏ ନାହିଁ।",

  lobbyHeading: "ପରାମର୍ଶ",
  joinConsultation: "ଯୋଗ ଦିଅନ୍ତୁ",
  connecting: "ଯୋଗ ଦେଉଛି…",
  connected: "ଯୋଗ ଦେଲା",
  reconnecting: "ପୁଣି ଯୋଗ ଦେଉଛି…",
  switchedToAudio: "ଅଡିଓକୁ ବଦଳିଲା",
  switchedToText: "ଲେଖାକୁ ବଦଳିଲା",
  connectionFailed: "ସଂଯୋଗ ବିଫଳ",
  mute: "ମାଇକ୍ ବନ୍ଦ କରନ୍ତୁ",
  unmute: "ମାଇକ୍ ଚାଲୁ କରନ୍ତୁ",
  cameraOn: "କ୍ୟାମେରା ଚାଲୁ କରନ୍ତୁ",
  cameraOff: "କ୍ୟାମେରା ବନ୍ଦ କରନ୍ତୁ",
  endConsultation: "ପରାମର୍ଶ ସମାପ୍ତ କରନ୍ତୁ",
  continueByText: "ସୁରକ୍ଷିତ ଲେଖା ସନ୍ଦେଶରେ ଜାରି ରଖନ୍ତୁ",
  sendVoiceNote: "ଛୋଟ ସ୍ୱର-ଟିପ୍ପଣୀ ପଠାନ୍ତୁ",
  tryAudioOnly: "କେବଳ ଅଡିଓ ଚେଷ୍ଟା କରନ୍ତୁ",
  bandwidthHint: "ଧୀର ସଂଯୋଗରେ ଲେଖା ସନ୍ଦେଶ ସବୁଠାରୁ ଭରସାଯୋଗ୍ୟ।",
  permissionDenied: "ମାଇକ୍ କିମ୍ବା କ୍ୟାମେରା ଅନୁମତି ମିଳିଲା ନାହିଁ। ଆପଣ ଲେଖା ସନ୍ଦେଶରେ ଜାରି ରଖିପାରିବେ।",
  realtimeUnavailable:
    "ସିଧା ଅଡିଓ/ଭିଡିଓ ଏବେ ଉପଲବ୍ଧ ନାହିଁ। ସୁରକ୍ଷିତ ଲେଖା ସନ୍ଦେଶ ପୂର୍ଣ୍ଣ ଭାବରେ ଉପଲବ୍ଧ।",

  staffNotConfigured: "ଷ୍ଟାଫ୍ ଆକ୍ସେସ୍ କନଫିଗର ହୋଇନାହିଁ",

  adminConsoleTitle: "ଷ୍ଟାଫ୍ ପ୍ରଶାସନ",
  adminConsoleSubtitle:
    "ଷ୍ଟାଫ୍ ଭୂମିକା ନିୟୋଜନ ଓ ପରିଚାଳନା କରନ୍ତୁ। ପ୍ରତ୍ୟେକ କାର୍ଯ୍ୟ ସର୍ଭରରେ ଅନୁମୋଦିତ ଏବଂ ଅଡିଟ୍ ଇତିହାସରେ ଲିପିବଦ୍ଧ।",
  adminNoAccess: "ଏହି ଖାତା ପାଇଁ ପ୍ଲାଟଫର୍ମ ପ୍ରଶାସକ ଆକ୍ସେସ୍ କନଫିଗର ହୋଇନାହିଁ",
  adminNoAccessHint:
    "ଭୂମିକା କେବଳ ମୌଜୁଦା ପ୍ଲାଟଫର୍ମ ପ୍ରଶାସକ ପରିଚାଳନା କରିପାରିବେ। ଆକ୍ସେସ୍ ଦେବା ପାଇଁ ନିଜ ପ୍ରଶାସକଙ୍କୁ ସ୍ଥାନୀୟ ଷ୍ଟାଫ୍ ବୁଟଷ୍ଟ୍ରାପ୍ କମାଣ୍ଡ ଚଲାଇବାକୁ କୁହନ୍ତୁ।",
  adminRolesHeading: "ବର୍ତ୍ତମାନ ଷ୍ଟାଫ୍ ଭୂମିକା",
  adminAssignHeading: "ମୌଜୁଦା ଉପଯୋଗକର୍ତ୍ତାଙ୍କୁ ଭୂମିକା ନିୟୋଜନ କରନ୍ତୁ",
  adminAssignUserId: "ଉପଯୋଗକର୍ତ୍ତା ଆଇଡି (UUID)",
  adminAssignRole: "ଭୂମିକା",
  adminAssignScope: "ସୁବିଧା ବା ଫାର୍ମାସି ଆଇଡି",
  adminAssignScopeHint: "କ୍ଲିନିସିୟନ୍, ସମନ୍ୱୟକାରୀ ଓ ଫାର୍ମାସି ଭୂମିକା ପାଇଁ ଆବଶ୍ୟକ।",
  adminAssignSubmit: "ଭୂମିକା ନିୟୋଜନ କରନ୍ତୁ",
  adminRoleUser: "ଉପଯୋଗକର୍ତ୍ତା",
  adminRoleStatus: "ସ୍ଥିତି",
  adminActionSuspend: "ସାମୟିକ ବନ୍ଦ",
  adminActionReinstate: "ପୁନଃସ୍ଥାପନ",
  adminActionRevoke: "ବାତିଲ",
  adminConfirmRevoke: "ଏହି ଭୂମିକା ବାତିଲ କରିବେ? ବ୍ୟକ୍ତିଙ୍କ ଷ୍ଟାଫ୍ ଆକ୍ସେସ୍ ତୁରନ୍ତ ବନ୍ଦ ହୋଇଯିବ।",
  adminEmpty: "ଏପର୍ଯ୍ୟନ୍ତ କୌଣସି ଷ୍ଟାଫ୍ ଭୂମିକା ନିୟୋଜିତ ହୋଇନାହିଁ।",
  adminAuditHeading: "ସାମ୍ପ୍ରତିକ ପ୍ରଶାସନିକ କାର୍ଯ୍ୟ",
  adminAuditEmpty: "ଏପର୍ଯ୍ୟନ୍ତ କୌଣସି ପ୍ରଶାସନିକ କାର୍ଯ୍ୟ ଲିପିବଦ୍ଧ ନାହିଁ।",
  adminSaved: "ଭୂମିକା ଅପଡେଟ୍ ହୋଇଗଲା।",
  staffNotConfiguredHint:
    "ଏହି ଦୃଶ୍ୟ ସହଭାଗୀ ଡାକ୍ତର ଓ ସୁବିଧା ସମନ୍ୱୟକଙ୍କ ପାଇଁ। ଏହି ଡିଭାଇସରେ କୌଣସି ଷ୍ଟାଫ୍ ଖାତା ନାହିଁ।",
  availabilityControls: "ମୋର ଉପଲବ୍ଧତା",
  assignedQueue: "ନିଯୁକ୍ତ ଯତ୍ନ ଅନୁରୋଧ",
  unassignedQueue: "ଅଣ-ନିଯୁକ୍ତ ଅନୁରୋଧ",
  facilityOverview: "ସୁବିଧା ଉପଲବ୍ଧତା",

  errorGeneric: "କିଛି ଠିକ୍ ହେଲା ନାହିଁ। ଆପଣଙ୍କ ସୂଚନା ଏହି ଡିଭାଇସରେ ସୁରକ୍ଷିତ।",
};

const DICTS: Record<Language, Part3Dict> = { en, hi, or };

export function t3(
  lang: Language,
  key: keyof Part3Dict,
  vars?: Record<string, string | number>
): string {
  let text: string = DICTS[lang]?.[key] ?? en[key] ?? String(key);
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.replace(new RegExp(`\\{${name}\\}`, "g"), String(value));
    }
  }
  return text;
}

export function hasPart3(lang: Language, key: keyof Part3Dict): boolean {
  return Boolean(DICTS[lang]?.[key]);
}
