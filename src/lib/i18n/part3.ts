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

  hospitalFound: string;
  offlineAvailability: string;
  noClinicianMatch: string;
  noAvailableDoctors: string;
  staleAvailability: string;
  lookingForDoctor: string;
  requestConsultation: string;
  languageLabel: string;

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
  availabilityOverview: string;

  // Consultation lobby / secure text — Phase 1 Surface A
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
  availabilityControls: string;
  assignedQueue: string;
  unassignedQueue: string;
  facilityOverview: string;

  // Consultation status / kinematics
  consultIdle: string;
  consultConnecting: string;
  consultWaitingForPeer: string;
  consultWaitingForPatient: string;
  consultConnectingPeer: string;
  consultConnected: string;
  consultWeakConnection: string;
  consultAudioMode: string;
  consultReconnecting: string;
  consultOfflineSaved: string;
  consultEnded: string;
  consultError: string;

  // Peer presence
  peerJoined: string;
  peerDisconnected: string;

  // Error labels
  errPermissionDenied: string;
  errCameraUnavailable: string;
  errMicUnavailable: string;
  errUnsupportedBrowser: string;
  errSignallingUnavailable: string;
  errRoomNotAvailable: string;
  errNotAuthorized: string;
  errLoadFailed: string;
  actionTryAgain: string;
  actionContinueAudio: string;
  networkAudioOnly: string;

  // Camera capture (document upload flow)
  closeCamera: string;
  positionDocument: string;
  pageCapturedOne: string;
  pageCapturedMany: string;
  fitPageInFrame: string;
  turnOnFlash: string;
  turnOffFlash: string;
  capturePhoto: string;
  switchCamera: string;
  chooseAnotherOption: string;
  camDenied: string;
  camDeviceNotFound: string;
  camDeviceBusy: string;
  camInsecure: string;
  camUnavailable: string;
  camGeneric: string;

  // Mode suggestions
  sendSuggestionAudio: string;
  sendSuggestionVideo: string;
  recommendBanner: string;
  acceptSuggestion: string;
  dismissSuggestion: string;
  switchModeHeading: string;
  btnJoinVideo: string;
  btnJoinAudio: string;
  rejoinLive: string;

  // Connection quality
  connectionQuality: string;
  qualityGood: string;
  qualityFair: string;
  qualityPoor: string;
  qualityOffline: string;

  // Clinician-facing status
  clinicianPatientConnection: string;
  clinicianModeStatus: string;
  sessionNotReady: string;

  // Store-and-forward (secure text)
  storeForwardTitle: string;
  storeForwardTitleVariant: string;
  storeForwardBody: string;

  // Clinician queue actions
  queueEmpty: string;
  actionAccept: string;
  actionTakeRequest: string;
  myConsultations: string;
  noConsultations: string;
  technicalDetails: string;
  errorGeneric: string;
  noSeenClaims: string;
  adminConsoleTitle: string;
  adminConsoleSubtitle: string;
  adminSaved: string;
  adminAssignHeading: string;
  adminAssignUserId: string;
  adminAssignRole: string;
  adminAssignScope: string;
  adminAssignScopeHint: string;
  adminAssignSubmit: string;
  adminRolesHeading: string;
  adminEmpty: string;
  adminRoleStatus: string;
  adminActionReinstate: string;
  adminActionSuspend: string;
  adminActionRevoke: string;
  adminAuditHeading: string;
  adminAuditEmpty: string;
  adminNoAccess: string;
  adminNoAccessHint: string;
  adminConfirmRevoke: string;
}

const en: Part3Dict = {
  statusHeading: "Status",
  statusLabel: "Status",
  statusAwaitingReview: "Awaiting review",
  statusAssigned: "Assigned",
  statusAccepted: "Accepted",
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

  // Phase 3 — patient available-doctor screen
  hospitalFound: "Talk to a doctor",
  offlineAvailability:
    "Internet is offline. Your last doctor list was saved on this device and may not reflect who is available now.",
  noClinicianMatch: "No clinician matched your request right now.",
  noAvailableDoctors: "No available clinician matched your request.",
  staleAvailability: "Doctor availability was last updated a while ago.",
  lookingForDoctor: "Looking for an available doctor…",
  requestConsultation: "Request consultation",
  languageLabel: "Language: {lang}",

  requestCare: "Request care",
  proposeAppointment: "Propose an appointment",
  proposedTime: "Proposed time",
  confirmAppointment: "Confirm appointment",
  declineProposal: "Decline proposal",
  patientAckNote: "You confirm this time yourself. Nothing is booked without you.",

  consentHeading: "Share your records",
  consentExplanation:
    "Only the selected records will be shared with the assigned care team for this request.",
  consentGrant: "Grant consent",
  consentRevoke: "Revoke consent",
  consentRevoked: "Consent revoked",
  consentSelectedRecords: "Selected records",

  messagesHeading: "Messages",
  messagePlaceholder: "Write a short message…",
  messageSend: "Send",
  messageSavedLocally: "Saved on this device",
  messageSending: "Sending…",
  messageDelivered: "Delivered",
  messageFailed: "Failed to send",
  messagesEmpty: "No messages yet.",

  availabilityOverview: "Available clinicians and pharmacies",

  // Consultation lobby / secure text — Phase 1 Surface A
  lobbyHeading: "A consultation is in progress",
  joinConsultation: "Request consultation",
  connecting: "Connecting…",
  connected: "Connected",
  reconnecting: "Trying to reconnect…",
  switchedToAudio: "Switched to audio call",
  switchedToText: "Switched to text messages",
  connectionFailed: "Connection failed",
  mute: "Mute microphone",
  unmute: "Unmute microphone",
  cameraOn: "Camera on",
  cameraOff: "Camera off",
  endConsultation: "End consultation",
  continueByText: "Continue by secure text",
  sendVoiceNote: "Send voice note",
  tryAudioOnly: "Try audio-only call",
  bandwidthHint: "Low bandwidth: audio only is fine",
  permissionDenied: "Permission denied",
  realtimeUnavailable: "Live audio/video is not available right now",
  staffNotConfigured: "Staff not configured",
  staffNotConfiguredHint: "Ask your facility coordinator",
  availabilityControls: "Availability controls",
  assignedQueue: "Assigned queue",
  unassignedQueue: "Unassigned queue",
  facilityOverview: "Facility overview",

  // Consultation status
  consultIdle: "Ready when you are",
  consultConnecting: "Connecting",
  consultWaitingForPeer: "Waiting for your doctor to join",
  consultWaitingForPatient: "Waiting for the patient to join",
  consultConnectingPeer: "Connecting to the other person",
  consultConnected: "Connected",
  consultWeakConnection: "Weak connection",
  consultAudioMode: "Audio mode",
  consultReconnecting: "Trying to reconnect…",
  consultOfflineSaved: "Saved offline",
  consultEnded: "Ended",
  consultError: "Error",

  // Peer presence
  peerJoined: "The other person joined",
  peerDisconnected: "The other person left",

  // Error labels
  errPermissionDenied: "Camera or microphone permission was denied",
  errCameraUnavailable: "Camera unavailable",
  errMicUnavailable: "Microphone unavailable",
  errUnsupportedBrowser: "This browser is not supported",
  errSignallingUnavailable: "Signalling service unavailable",
  errRoomNotAvailable: "Conference room unavailable",
  errNotAuthorized: "You do not have access to this consultation",
  errLoadFailed: "Could not load this consultation",
  actionTryAgain: "Try again",
  actionContinueAudio: "Continue with audio only",
  networkAudioOnly: "Low network: switched to audio",

  // Camera capture (document upload flow)
  closeCamera: "Close camera",
  positionDocument: "Position document in frame",
  pageCapturedOne: "{count} page captured",
  pageCapturedMany: "{count} pages captured",
  fitPageInFrame: "Fit the full page inside the frame",
  turnOnFlash: "Turn on flash",
  turnOffFlash: "Turn off flash",
  capturePhoto: "Capture photo",
  switchCamera: "Switch camera",
  chooseAnotherOption: "Choose another option",
  camDenied: "Camera access is blocked. Allow camera permission in your browser settings, or choose photos from your device.",
  camDeviceNotFound: "No camera was detected. You can upload a PDF or select images instead.",
  camDeviceBusy: "The camera may be in use by another application. Close that application and try again.",
  camInsecure: "Camera access requires HTTPS or localhost. You can still upload an existing file.",
  camUnavailable: "Camera access is not supported in this browser. You can upload a PDF or select images instead.",
  camGeneric: "Could not access the camera. You can upload a file instead.",

  // Mode suggestions
  sendSuggestionAudio: "Suggest audio call",
  sendSuggestionVideo: "Suggest video call",
  recommendBanner: "Doctor suggests {mode}",
  acceptSuggestion: "Switch now",
  dismissSuggestion: "Not now",
  switchModeHeading: "Switch consultation mode",
  btnJoinVideo: "Join with video",
  btnJoinAudio: "Join with audio",
  rejoinLive: "Try live connection again",

  // Connection quality
  connectionQuality: "Connection: {quality}",
  qualityGood: "Good",
  qualityFair: "Fair",
  qualityPoor: "Poor",
  qualityOffline: "no connection",

  // Clinician-facing status
  clinicianPatientConnection: "Patient connection: {quality}",
  clinicianModeStatus: "Consultation mode: {mode}",
  sessionNotReady: "This consultation is not confirmed yet",

  // Store-and-forward (secure text)
  storeForwardTitle: "Message saved",
  storeForwardBody: "Saved securely on this device — sent when you reconnect",
  storeForwardTitleVariant: "Saved securely on this device",

  // Clinician queue actions
  queueEmpty: "No requests",
  actionAccept: "Accept",
  actionTakeRequest: "Take request",
  myConsultations: "My consultations",
  noConsultations: "No consultations",
  technicalDetails: "Technical details",
  errorGeneric: "An error occurred",
  noSeenClaims: "No seen claims",
  adminConsoleTitle: "Staff console",
  adminConsoleSubtitle: "Manage your care team",
  adminSaved: "Saved",
  adminAssignHeading: "Assign staff",
  adminAssignUserId: "User ID",
  adminAssignRole: "Role",
  adminAssignScope: "Scope",
  adminAssignScopeHint: "Which service area to assign this staff member",
  adminAssignSubmit: "Assign",
  adminRolesHeading: "Staff role",
  adminEmpty: "No staff",
  adminRoleStatus: "Status",
  adminActionReinstate: "Reinstate",
  adminActionSuspend: "Suspend",
  adminActionRevoke: "Revoke access",
  adminAuditHeading: "Staff details",
  adminAuditEmpty: "No details",
  adminNoAccess: "No staff access",
  adminNoAccessHint: "No staff settings in your unit",
  adminConfirmRevoke: "Confirm again",
};

const hi: Part3Dict = {
  statusHeading: "स्थिति",
  statusLabel: "स्थिति",
  statusAwaitingReview: "समीक्षा की प्रतीक्षा में",
  statusAssigned: "सौंपा गया",
  statusAccepted: "स्वीकृत",
  statusProposed: "अनुस्खण्ड प्रस्तावित है",
  statusConfirmed: "अनुस्खण्ड पुष्टि हुआ",
  statusInConsultation: "परामर्श चल रहा है",
  statusCompleted: "पूर्ण",
  statusCancelled: "रद्द",
  statusDeclined: "देखभाल टीम ने यह अनुरोध लेने से इनकार कर दिया",
  statusNeedsAttention: "ज़रूरत है",
  statusQueuedOffline: "इस डिवाइस पर सहेजा गया",

  careOptionsHeading: "उपलब्ध देखभाल टीम",
  careOptionsLabel: "उपलब्ध विकल्प",
  careOptionsNone:
    "इस तकनीकी समय पर कोई क्लिनिशियन उपलब्ध नहीं है। आपका अनुरोध सहेजा गया है और जब कोई क्लिनिशियन उपलब्ध होगा, उसे देखा जा सकता है।",
  careOptionsNoneHint: "आपको कुछ करने की ज़रूरत नहीं। हम आपका अनुरोध सुरक्षित रखते हैं।",

  clinicianSpecialty: "सेवा क्षेत्र",
  clinicianLanguages: "भाषाएँ",
  clinicianModes: "परामर्श के तरीके",
  modeText: "संदेश",
  modeAudio: "ऑडियो कॉल",
  modeVideo: "वीडियो कॉल",
  updatedJustNow: "अभी ही अपडेट",
  updatedMinutesAgo: "{count} मिनट पहले अपडेट हुआ",
  freshnessStale: "उपलब्धता की जानकारी ताज़ा हो रही है",

  // Phase 3 — patient available-doctor screen
  hospitalFound: "डॉक्टर से बात करें",
  offlineAvailability:
    "इंटरनेट ऑफ़लाइन है। आपकी पिछली डॉक्टर सूची इस डिवाइस पर सहेजी गई है और यह दिखा सकती है कि कौन अब उपलब्ध है — यह ताज़ा नहीं हो सकती।",
  noClinicianMatch: "अभी आपके अनुरोध से कोई क्लिनिशियन मेल नहीं खाता।",
  noAvailableDoctors: "कोई उपलब्ध क्लिनिशियन आपके अनुरोध का मिलान नहीं कर पाया।",
  staleAvailability: "डॉक्टर की उपलब्धता का अंतिम अपडेट कुछ समय पूर्व हुआ।",
  lookingForDoctor: "उपलब्ध डॉक्टर खोजा जा रहा है…",
  requestConsultation: "परामर्श करने का अनुरोध करें",
  languageLabel: "भाषा: {lang}",

  requestCare: "देखभाल का अनुरोध करें",
  proposeAppointment: "अनुस्खण्ड प्रस्तावित करें",
  proposedTime: "प्रस्तावित समय",
  confirmAppointment: "अनुस्खण्ड पुष्ट करें",
  declineProposal: "प्रस्ताव अस्वीकार करें",
  patientAckNote: "आप स्वयं इस समय की पुष्टि करते हैं। आपके बिना कोई बुक नहीं होता।",

  consentHeading: "अपने रिकॉर्ड साझा करें",
  consentExplanation:
    "केवल चयनित रिकॉर्ड इस अनुरोध के लिए सौंपे गए देखभाल टीम को साझा किए जाएँगे।",
  consentGrant: "सहमति दें",
  consentRevoke: "सहमति वापस लें",
  consentRevoked: "सहमति वापस ली गई",
  consentSelectedRecords: "चयनित रिकॉर्ड",

  messagesHeading: "संदेश",
  messagePlaceholder: "एक छोटा संदेश लिखें…",
  messageSend: "भेजें",
  messageSavedLocally: "इस डिवाइस पर सहेजा गया",
  messageSending: "भेजा जा रहा…",
  messageDelivered: "पहुँचा",
  messageFailed: "भेजने में विफल",
  messagesEmpty: "अभी कोई संदेश नहीं।",

  availabilityOverview: "उपलब्ध क्लिनिशियन और फार्मेसियाँ",

  // Consultation lobby / secure text — Phase 1 Surface A
  lobbyHeading: "एक कंसल्टेशन काम चल रहा है",
  joinConsultation: "कंसल्टेशन माँगें",
  connecting: "जुड़ा जा रहा है…",
  connected: "जुड़ा",
  reconnecting: "पुनः जुड़ने की कोशिश…",
  switchedToAudio: "ऑडियो कॉल पर बदला गया",
  switchedToText: "संदेश पर बदला गया",
  connectionFailed: "जुड़ना विफल",
  mute: "माइक बंद",
  unmute: "माइक खोलें",
  cameraOn: "कैमरा चालू",
  cameraOff: "कैमरा बंद",
  endConsultation: "कंसल्टेशन समाप्त करें",
  continueByText: "सुरक्षित संदेश से जारी रखें",
  sendVoiceNote: "कँठ संदेश भेजें",
  tryAudioOnly: "केवल ऑडियो कॉल कोशिश",
  bandwidthHint: "कम बैंडविड्थ: केवल ऑडियो ठीक है",
  permissionDenied: "अनुमति नहीं मिली",
  realtimeUnavailable: "लाइव ऑडियो/वीडियो अभी उपलब्ध नहीं",
  staffNotConfigured: "कर्मचारी सेटिंग सजाई नहीं गई",
  staffNotConfiguredHint: "अपने सुविधा प्रबंधक से अनुरोध करें",
  availabilityControls: "उपलब्धता नियंत्रण",
  assignedQueue: "सौंपी गई अनुरोध",
  unassignedQueue: "असौंपी अनुरोध",
  facilityOverview: "सेवा क्षेत्र सारांश",

  // Consultation status / kinematics
  consultIdle: "जब आप तैयार हों",
  consultConnecting: "जुड़ा जा रहा है…",
  consultWaitingForPeer: "अपने डॉक्टर आने तक प्रतीक्षा",
  consultWaitingForPatient: "रोगी आने तक प्रतीक्षा",
  consultConnectingPeer: "दूसरे व्यक्ति से जुड़ने तक प्रतीक्षा",
  consultConnected: "जुड़ा",
  consultWeakConnection: "कम संपर्क गुणवत्ता",
  consultAudioMode: "केवल ऑडियो कॉल",
  consultReconnecting: "पुनः जुड़ा जा रहा है…",
  consultOfflineSaved: "इस डिवाइस पर सहेजा गया",
  consultEnded: "कंसल्टेशन समाप्त",
  consultError: "कंसल्टेशन त्रुटि",

  // Peer presence
  peerJoined: "दूसरा व्यक्ति जुड़ गया",
  peerDisconnected: "दूसरा व्यक्ति बिछ्ड़ा",

  // Error labels
  errPermissionDenied: "कैमरा या माइक्रोफोन अनुमति नहीं मिली",
  errCameraUnavailable: "कैमरा उपलब्ध नहीं",
  errMicUnavailable: "माइक्रोफोन उपलब्ध नहीं",
  errUnsupportedBrowser: "यह ब्राउज़र सहायता नहीं करता",
  errSignallingUnavailable: "सिंग्नलिंग सेवा उपलब्ध नहीं",
  errRoomNotAvailable: "कॉन्फ्रेंस कक्ष उपलब्ध नहीं",
  errNotAuthorized: "आपको इस कंसल्टेशन तक पहुँच नहीं है",
  errLoadFailed: "यह कंसल्टेशन लोड नहीं हो सका",
  actionTryAgain: "पुनः कोशिश करें",
  actionContinueAudio: "केवल ऑडियो कॉल चल रहा",
  networkAudioOnly: "कम नेटवर्क: ऑडियो पर बदला",

  // Camera capture (document upload flow)
  closeCamera: "कैमरा बंद करें",
  positionDocument: "दस्तावेज़ को फ़्रेम में रखें",
  pageCapturedOne: "{count} पेज कैमरे से लिया",
  pageCapturedMany: "{count} पेज कैमरे से लिए",
  fitPageInFrame: "पूरा पेज फ़्रेम के अंदर फिट करें",
  turnOnFlash: "फ़्लैश चालू करें",
  turnOffFlash: "फ़्लैश बंद करें",
  capturePhoto: "फ़ोटो लें",
  switchCamera: "कैमरा बदलें",
  chooseAnotherOption: "दूसरा विकल्प चुनें",
  camDenied: "कैमरा अनुमति बंद है। ब्राउज़र सेटिंग में कैमरा अनुमति दें, या अपने डिवाइस से फ़ोटो चुनें।",
  camDeviceNotFound: "कैमरा नहीं मिला। आप PDF अपलोड करें या इमेज चुनें।",
  camDeviceBusy: "कैमरा दूसरी ऐप पर काम कर रहा है। उस ऐप को बंद करके पुनः कोशिश करें।",
  camInsecure: "कैमरा के लिए HTTPS या localhost चाहिए। आप फ़ाइल अपलोड कर सकते हैं।",
  camUnavailable: "इस ब्राउज़र में कैमरा सहायता नहीं। आप PDF अपलोड करें या इमेज चुनें।",
  camGeneric: "कैमरा उपलब्ध नहीं। आप फ़ाइल अपलोड कर सकते हैं।",

  // Mode suggestions
  sendSuggestionAudio: "ऑडियो कॉल सुझाव",
  sendSuggestionVideo: "वीडियो कॉल सुझाव",
  recommendBanner: "डॉक्टर का सुझाव: {mode}",
  acceptSuggestion: "अभी बदलें",
  dismissSuggestion: "ठारِदिएं",
  switchModeHeading: "कंसल्टेशन मोड बदलें",
  btnJoinVideo: "वीडियो से जुड़ें",
  btnJoinAudio: "ऑडियो से जुड़ें",
  rejoinLive: "लाइव कनेक्शन फिर से आज़माएं",

  // Connection quality
  connectionQuality: "कनेक्शन: {quality}",
  qualityGood: "अच्छा",
  qualityFair: "मध्यम",
  qualityPoor: "खराब",
  qualityOffline: "कोई कनेक्शन नहीं",

  // Clinician-facing status
  clinicianPatientConnection: "रोगी से कनेक्शन: {quality}",
  clinicianModeStatus: "कंसल्टेशन मोड: {mode}",
  sessionNotReady: "यह कंसल्टेशन अभी पुष्टि नहीं हुई",

  // Store-and-forward (secure text)
  storeForwardTitle: "संदेश सहेजा गया",
  storeForwardBody: "इस डिवाइस पर सुरक्षित रूप से सहेजा गया — कनेक्ट होने पर भेजा जाएगा",
  storeForwardTitleVariant: "इस डिवाइस पर सुरक्षित रूप से सहेजा गया",

  // Clinician queue actions
  queueEmpty: "कोई अनुरोध नहीं",
  actionAccept: "स्वीकार करें",
  actionTakeRequest: "अनुरोध लें",
  myConsultations: "मेरे कंसल्टेशन",
  noConsultations: "कोई कंसल्टेशन नहीं",
  technicalDetails: "तकनीकी विवरण",
  errorGeneric: "एक त्रुटि हुई",
  noSeenClaims: "कोई देखा गया दावा नहीं",
  adminConsoleTitle: "कर्मचारी कंसोल",
  adminConsoleSubtitle: "अपने सेवा दल को प्रबंधित करें",
  adminSaved: "सहेजा गया",
  adminAssignHeading: "कर्मचारी को सौंपें",
  adminAssignUserId: "उपयोगकर्ता आईडी",
  adminAssignRole: "भूमिका",
  adminAssignScope: "स्कोप",
  adminAssignScopeHint: "इस कर्मचारी को किस सेवा क्षेत्र के साथ सौंपना है",
  adminAssignSubmit: "सौंपें",
  adminRolesHeading: "कर्मचारी भूमिका",
  adminEmpty: "कोई कर्मचारी नहीं",
  adminRoleStatus: "स्थिति",
  adminActionReinstate: "पुनः कार्य में लौटाएं",
  adminActionSuspend: "अस्थायी रोक",
  adminActionRevoke: "अधिकार बर्तवल करें",
  adminAuditHeading: "कर्मचारी विवरण",
  adminAuditEmpty: "कोई विवरण नहीं",
  adminNoAccess: "कर्मचारी पहुँच नहीं",
  adminNoAccessHint: "आपकी ईकाई में कोई कर्मचारी सेटिंग नहीं",
  adminConfirmRevoke: "पुनः सहमति दें",
};

const or: Part3Dict = {
  statusHeading: "ସ୍ଥିତି",
  statusLabel: "ସ୍ଥିତି",
  statusAwaitingReview: "� ପରୀକ୍ଷାର ଅନୁବ୍ୟବେକ୍ଷଣ",
  statusAssigned: "ନିର୍ଦ୍ଦେଶିତ",
  statusAccepted: "ସ୍ବୀକୃତ",
  statusProposed: "ଏକ ଅନୁରୋଧ ପ୍ରସ୍ତୁତ କରାଯାଇଛି",
  statusConfirmed: "ଅନୁରୋଧ ପୁଷ୍ଟି ହୋଇଛି",
  statusInConsultation: "�ପରାମର୍ଶ ଚାଲୁଅଛି",
  statusCompleted: "ସମ୍ପୂର୍ଣ୍ଣ",
  statusCancelled: "ରଦ୍ଦ",
  statusDeclined: "ଚିକିତ୍ସା ଦଳଦ୍ୱାରା ଏହି ଅନୁରୋଧ ଗ୍ରହଣ କରିବାକୁ ଅସ୍ୱୀକାର",
  statusNeedsAttention: "ପରିଚାଳନା ଦରକାର",
  statusQueuedOffline: "ଏହି ଡିଭାଇସରେ ସେଭାଯାଇଛି",

  careOptionsHeading: "ଉପଲବ୍ଧ ଚିକିତ୍ସା ତଥ୍ୟମାନ",
  careOptionsLabel: "ଉପଲବ୍ଧ ବିକଳ୍ପ",
  careOptionsNone:
    "ଏହି ସମୟରେ କୌଣସି ଚିକିତ୍ସକ ଉପଲବ୍ଧ ନାହିଁ। ଆପଣଙ୍କ ଅନୁରୋଧ ସଂରକ୍ଷିତ ଅଛି ଏବଂ ଚିକିତ୍ସକ ଉପଲବ୍ଧ ହେଲେ ପୁନଃ ଦେଖାଯିବ।",
  careOptionsNoneHint: "ଆପଣଙ୍କୁ କିଛି କରିବାର ଆବଶ୍ୟକ ନାହିଁ। ଆମେ ଆପଣଙ୍କ ଅନୁରୋଧ ସୁରକ୍ଷିତ ରଖୁଛୁ।",

  clinicianSpecialty: "ସେବା କ୍ଷେତ୍ର",
  clinicianLanguages: "ଭାଷା",
  clinicianModes: "ପରାମର୍ଶର ଉପାୟ",
  modeText: "ପଠନ୍ୟ ସନ୍ଦେଶ",
  modeAudio: "ଶବ୍ଦ କଲ୍",
  modeVideo: "ବିଡିଓ କଲ୍",
  updatedJustNow: "ନିକଟତର୍କରେ ଅପଡେଟ୍ ହୋଇଛି",
  updatedMinutesAgo: "{count} ମିନିଟ୍ ପୂର୍ବେ ଅପଡେଟ୍ ହୋଇଛି",
  freshnessStale: "ଉପଲବ୍ଧତା ସୂଚନା ତାଜା ହେଉଛି",

  // Phase 3 — patient available-doctor screen
  hospitalFound: "ଏକ ଚିକିତ୍ସକ ସହ କଥା କରନ୍ତୁ",
  offlineAvailability:
    "ଇଣ୍ଟରନେଟ ଅଫ୍ଲାଇନ୍ହ। ଆପଣଙ୍କ ପୂର୍ବ ଚିକିତ୍ସକ ସୂଚି ଏହି ଡିଭାଇସରେ ସେଭାଯାଇଛି ଏବଂ ଏହା ଦେଖାଇପାରେ କି କେଉଁଜଣ ଭାବରେ ପ୍ରସ୍ତୁତ। ଏହା ଭଳି ହେଉପରାହ୍ୟ ହୋଇପରିବ।",
  noClinicianMatch: "ବର୍ତ୍ତମାନ ଆପଣଙ୍କ ଅନୁରୋଧ ସହ କୌଣସି ଚିକିତ୍ସକ ମେଳ ଖୋଜିପାରୁନ୍ତୁ।",
  noAvailableDoctors: "କୌଣସି ଉପଲବ୍ଧ ଚିକିତ୍ସକ ଆପଣଙ୍କ ଅନୁରୋଧର ସହମତି ପାଇପାରିନାହିଁ।",
  staleAvailability: "ଚିକିତ୍ସକ ଉପଲବ୍ଧତାର ଅନ୍ତିମ ଅପଡେଟ୍ କିଛି ସମୟ ପୂର୍ବେ ହୋଇଛି।",
  lookingForDoctor: "ଉପଲବ୍ଧ ଚିକିତ୍ସକ ଖୋଜାଯାଉଛି…",
  requestConsultation: "ପରାମର୍ଶ କରନ୍ତୁ",
  languageLabel: "ଭାଷା: {lang}",

  requestCare: "ଯତ୍ନ ମାଗନ୍ତୁ",
  proposeAppointment: "ଏକ ଅନୁରୋଧ ପ୍ରସ୍ତୁତ କରନ୍ତୁ",
  proposedTime: "ପ୍ରସ୍ତୁତ ସମୟ",
  confirmAppointment: "ଅନୁରୋଧ ପୁଷ୍ଟି କରନ୍ତୁ",
  declineProposal: "ଅନୁରୋଧ ଅସ୍ବୀକାର କରନ୍ତୁ",
  patientAckNote: "ଆପଣେ ନି�େ ଏହି ସମୟର ପୁଷ୍ଟି କରନ୍ତୁ। ଆପଣଙ୍କ ବିନା କୌଣସି ସନ୍ଦେଶାଦାନ ହୋଇପାରେ ନାହିଁ।",

  consentHeading: "ଆପଣଙ୍କ ଅଭିଲେଖକୁ ମିଶାନ୍ତୁ",
  consentExplanation:
    "କେବଳ ଚୟନକୁଥିବା ଅଭିଲେଖକୁ ଏହି ଅନୁରୋଧ ପାଇଁ ନିର୍ଦ୍ଦେଶିତ ଚିକିତ୍ସା ଦଳକୁ ମିଶାନ୍ତୁ।",
  consentGrant: "ସହିତପାତ୍ର କରନ୍ତୁ",
  consentRevoke: "ସହିତପାତ୍ରତା ପଚାରନ୍ତୁ",
  consentRevoked: "ସହିତପାତ୍ରତା ପଚାରାଯାଇଛି",
  consentSelectedRecords: "ଚୟନକୁଥିବା ଅଭିଲେଖକୁ",

  messagesHeading: "ସନ୍ଦେଶ",
  messagePlaceholder: "ସନ୍ଦେଶ ଟାଇପ୍ କରନ୍ତୁ…",
  messageSend: "ପଠାନ୍ତୁ",
  messageSavedLocally: "ଏହି ଡିଭାଇସରେ ସେଭାଯାଇଛି",
  messageSending: "ପଠାଯାଉଛି…",
  messageDelivered: "ପଠାଯାଇଛି",
  messageFailed: "ପଠାଯାଇନି",
  messagesEmpty: "ଏହି ସମୟ ପର୍ଯନ୍ୟନ୍ତ କୌଣସି ସନ୍ଦେଶ ନାହିଁ。",

  availabilityOverview: "ଉପଲବ୍ଧ ଚିକିତ୍ସକ ଓ ଫାର୍ମାସି",

  // Consultation lobby / secure text — Phase 1 Surface A
  lobbyHeading: "ଗୋଟିଏ କନ୍ସଲ୍ଟେସନ୍ କାର୍ଯ୍ୟ କରୁଛି",
  joinConsultation: "କନ୍ସଲ୍ଟେସନ୍ ମାଗନ୍ତୁ",
  connecting: "ସଂଯୋଗ ହେଉଛି…",
  connected: "ସଂଯୁକ୍ତ",
  reconnecting: "ପୁନର୍ବାର ସଂଯୋଗ ହେଉଛି…",
  switchedToAudio: "ଶବ୍ଦ କଲ୍ କୁ ପରିବର୍ତ୍ତିତ ହୋଇଛି",
  switchedToText: "ପଠନ୍ୟ କୁ ପରିବର୍ତ୍ତିତ ହୋଇଛି",
  connectionFailed: "ସଂଯୋଗ ବିଫଳ",
  mute: "ମୁଖ ବନ୍ଦ",
  unmute: "ମୁଖ ଖୋଲା",
  cameraOn: "କ୍ୟାମେରା ଚାଲୁଅଛି",
  cameraOff: "କ୍ୟାମେରା ବନ୍ଦ",
  endConsultation: "କନ୍ସଲ୍ଟେସନ୍ ଶେଷ କରନ୍ତୁ",
  continueByText: "ପଠନ୍ୟ କରି ଚାଲନ୍ତୁ",
  sendVoiceNote: "କଣ୍ଠ ସନ୍ଦେଶ ପଠାନ୍ତୁ",
  tryAudioOnly: "କେବଳ ଶବ୍ଦ କଲ୍ ଚେଷ୍ଟା କରନ୍ତୁ",
  bandwidthHint: "କମ୍ ବ୍ୟାଣ୍ଡୱିଡଥ୍: କେବଳ ଶବ୍ଦ କଲ୍ ଉତ୍ତମ",
  permissionDenied: "ଅନୁମତି ପ୍ରାପ୍ତ ନୁହେଁ",
  realtimeUnavailable: "ଲାଇଭ୍ ଅପଡିଟ୍ ଅପେକ୍ଷିତ ନୁହେଁ",
  staffNotConfigured: "କର୍ମଚାରୀ ସେଟିଙ୍ଗ ସଜାଇ ଯାଇନାହିଁ",
  staffNotConfiguredHint: "ଆପଣଙ୍କ ଫେସିଲିଟି ପ୍ରବନ୍ଧକଙ୍କ ପାଖରେ ଅନୁରୋଧ କରନ୍ତୁ",
  availabilityControls: "ଉପଲବ୍ଧତା ନିୟନ୍ତ୍ରଣ",
  assignedQueue: "ସୋପିଆ ହୋଇଥିବା ଅନୁରୋଧ",
  unassignedQueue: "ଅସୋପିଆ ହୋଇଥିବା ଅନୁରୋଧ",
  facilityOverview: "ସେବା କ୍ଷେତ୍ର ସାରାଂଶ",

  // Consultation status / kinematics
  consultIdle: "ପ୍ରସ୍ତୁତ",
  consultConnecting: "ସଂଯୋଗ ହେଉଛି…",
  consultWaitingForPeer: "ଅନ୍ୟ ବ୍ୟକ୍ତି ହଜିବା ପର୍ଯ୍ୟନ୍ତ ଅପେକ୍ଷା",
  consultWaitingForPatient: "ରୋଗୀ ହଜିବା ପର୍ଯ୍ୟନ୍ତ ଅପେକ୍ଷା",
  consultConnectingPeer: "ଅନ୍ୟ ବ୍ୟକ୍ତିଙ୍କୁ ସଂଯୋଗ କରିବା ପର୍ଯ୍ୟନ୍ତ ଅପେକ୍ଷା",
  consultConnected: "ସଂଯୁକ୍ତ",
  consultWeakConnection: "କମ୍ ସଂଯୋଗ ଗୁଣବତ୍ତା",
  consultAudioMode: "କେବଳ ଶବ୍ଦ କଲ୍",
  consultReconnecting: "ପୁନର୍ବାର ସଂଯୋଗ ହେଉଛି…",
  consultOfflineSaved: "ଏହି ଡିଭାଇସରେ ସେଭା ହୋଇଛି",
  consultEnded: "କନ୍ସଲ୍ଟେସନ୍ ଶେଷ",
  consultError: "କନ୍ସଲ୍ଟେସନ୍ ତ୍ରୁଟି",

  // Peer presence
  peerJoined: "ଅନ୍ୟ ବ୍ୟକ୍ତି ଯୋଗ ଦେଲେ",
  peerDisconnected: "ଅନ୍ୟ ବ୍ୟକ୍ତି ବିଚ୍ଛେଦ ହେଲେ",

  // Error labels
  errPermissionDenied: "ଅନୁମତି ପ୍ରାପ୍ତ ନୁହେଁ",
  errCameraUnavailable: "କ୍ୟାମେରା ଉପଲବ୍ଧ ନୁହେଁ",
  errMicUnavailable: "ମାଇକ୍ରୋଫୋନ୍ ଉପଲବ୍ଧ ନୁହେଁ",
  errUnsupportedBrowser: "ଏହି ବ୍ରାଉଜର୍ ସମର୍ଥନ କରେ ନାହିଁ",
  errSignallingUnavailable: "ସିଗ୍ନାଲିଂ ସେବା ଅପେକ୍ଷିତ ନୁହେଁ",
  errRoomNotAvailable: "କାନ୍ଫରେନ୍ସ୍ କୋମର ଉପଲବ୍ଧ ନୁହେଁ",
  errNotAuthorized: "ଏହି ସେବା ଯାଇପାରିବେ ନାହିଁ",
  errLoadFailed: "କନ୍ସଲ୍ଟେସନ୍ ହେଉନିଅନ୍ତି",
  actionTryAgain: "ପୁନର୍ବାର ଚେଷ୍ଟା କରନ୍ତୁ",
  actionContinueAudio: "କେବଳ ଶବ୍ଦ କଲ୍ ଚାଲୁଅଛି",
  networkAudioOnly: "କମ୍ ନେଟ୍ୱାର୍କ: ଶବ୍ଦ କୁ ପରିବର୍ତ୍ତିତ",

  // Camera capture (document upload flow)
  closeCamera: "କ୍ୟାମେରା ବନ୍ଦ କରନ୍ତୁ",
  positionDocument: "ଦସ୍ତାବିଜ୍ ଫ୍ରେମ୍ ଭିତରେ ରଖନ୍ତୁ",
  pageCapturedOne: "{count} ପେଜି କ୍ୟାମେରା କରାଗଲା",
  pageCapturedMany: "{count} ପେଜି କ୍ୟାମେରା କରାଗଲା",
  fitPageInFrame: "ସମ୍ପୂର୍ଣ୍ଣ ପେଜି ଫ୍ରେମ୍ ଭିତରେ ଫିଟ କରନ୍ତୁ",
  turnOnFlash: "ଫ୍ଲ୍ୟାସ୍ ଚାଲୁ କରନ୍ତୁ",
  turnOffFlash: "ଫ୍ଲ୍ୟାସ୍ ବନ୍ଦ କରନ୍ତୁ",
  capturePhoto: "ଫୋଟୋ ନିଅନ୍ତୁ",
  switchCamera: "କ୍ୟାମେରା ବଦଳାନ୍ତୁ",
  chooseAnotherOption: "ଅନ୍ୟ ବିକଳ୍ପ ବାଛନ୍ତୁ",
  camDenied: "କ୍ୟାମେରା ଅନୁମତି ବନ୍ଦ ଅଛି। ବ୍ରାଉଜର୍ ସେଟିଙ୍ରେ ଅନୁମତି ଦିଅନ୍ତୁ, ବା ଡିଭାଇସରୁ ଛବି ବାଛନ୍ତୁ।",
  camDeviceNotFound: "କ୍ୟାମେରା ମିଳିଲା ନାହିଁ। ଆପଣ PDF ଅପଲୋଡ୍ କରନ୍ତୁ ବା ଛବି ବାଛନ୍ତୁ।",
  camDeviceBusy: "କ୍ୟାମେରା ଅନ୍ୟ ଆପରେ ବ୍ୟବହୃତ ହେଉଛି। ସେହି ଆପ ବନ୍ଦ କରି ପୁନର୍ବାର ଚେଷ୍ଟା କରନ୍ତୁ।",
  camInsecure: "କ୍ୟାମେରା ପାଇଁ HTTPS ବା localhost ଆବଶ୍ୟକ। ଆପଣ ଫାଇଲ ଅପଲୋଡ୍ କରିପାରନ୍ତି।",
  camUnavailable: "ଏହି ବ୍ରାଉଜରରେ କ୍ୟାମେରା ସମର୍ଥିତ ନୁହେଁ। ଆପଣ PDF ଅପଲୋଡ୍ କରନ୍ତୁ ବା ଛବି ବାଛନ୍ତୁ।",
  camGeneric: "କ୍ୟାମେରା ଉପଲବ୍ଧ ନୁହେଁ। ଆପଣ ଫାଇଲ ଅପଲୋଡ୍ କରିପାରନ୍ତି।",

  // Mode suggestions
  sendSuggestionAudio: "ଶବ୍ଦ କଲ୍ ପ୍ରସ୍ତାବ",
  sendSuggestionVideo: "ଵିଡିଓ କଲ୍ ପ୍ରସ୍ତାବ",
  recommendBanner: "ସିସ୍ଟମ ପ୍ରସ୍ତାବ",
  acceptSuggestion: "ଗ୍ରହଣ କରନ୍ତୁ",
  dismissSuggestion: "ଠାରିଦିଅନ୍ତୁ",
  switchModeHeading: "କନ୍ସଲ୍ଟେସନ୍ ପଭା ବଦଳାଇନେବା",
  btnJoinVideo: "ଭିଡିଓ କଲ୍ ଯୋଗ",
  btnJoinAudio: "ଶବ୍ଦ କଲ୍ ଯୋଗ",
  rejoinLive: "ପୁନର୍ବାର ଜୀବନ୍ତ କନ୍ସଲ୍ଟେସନ୍ ଯୋଗ",

  // Connection quality
  connectionQuality: "ସଂଯୋଗ ଗୁଣବତ୍ତା",
  qualityGood: "ଭଲ",
  qualityFair: "ମାଧ୍ୟମ",
  qualityPoor: "ଖରାବ",
  qualityOffline: "ଅଫ୍ଲାଇନ୍",

  // Clinician-facing status
  clinicianPatientConnection: "ରୋଗୀ ସହ ସଂଯୋଗ",
  clinicianModeStatus: "କନ୍ସଲ୍ଟେସନ୍ ପଭା",
  sessionNotReady: "ସେଶନ୍ ପ୍ରସ୍ତୁତ ନୁହେଁ",

  // Store-and-forward (secure text)
  storeForwardTitle: "ବାର୍ତ୍ତା ସେଭ ହୋଇଛି",
  storeForwardBody: "ଆପଣଙ୍କ ବାର୍ତ୍ତା ଏହାକୁ ଯେତେବେଳେ ଆମେ ଯୋଗାଯୋଗ ପାଇବାରେ ପଠାଯାଇବ",
  storeForwardTitleVariant: "ଏହି ଡିଭାଇସରେ ସୁରକ୍ଷିତ ଭାବରେ ସେଭା ହୋଇଛି",

  // Clinician queue actions
  queueEmpty: "କୌଣସି ଅନୁରୋଧ ନାହିଁ",
  actionAccept: "ଗ୍ରହଣ କରନ୍ତୁ",
  actionTakeRequest: "ଅନୁରୋଧ ନିଅନ୍ତୁ",
  myConsultations: "ମୋର କନ୍ସଲ୍ଟେସନ୍",
  noConsultations: "କୌଣସି କନ୍ସଲ୍ଟେସନ୍ ନାହିଁ",
  technicalDetails: "କଲ୍ ବିବରଣୀ",
  errorGeneric: "ଏକ ତ୍ରୁଟି ଘଟିଥିଲା",
  noSeenClaims: "କୌଣସି ଦେଖାଯାଇଥିବା ଦାବା ନାହିଁ",
  adminConsoleTitle: "କର୍ମଚାରୀ କନ୍ସୋଲ୍",
  adminConsoleSubtitle: "ଆପଣଙ୍କ ସେବା ଦଳକୁ ପରିଚାଳନା କରନ୍ତୁ",
  adminSaved: "ସେଭ ହୋଇଛି",
  adminAssignHeading: "କର୍ମଚାରୀକୁ ସୋପନ୍ତୁ",
  adminAssignUserId: "ବ୍ୟବହାରକାରୀ ଆଇଡି",
  adminAssignRole: "ଭୂମିକା",
  adminAssignScope: "ସ୍କୋପ୍",
  adminAssignScopeHint: "ଏହି କର୍ମଚାରୀକୁ କେଉଁ ସେବା କ୍ଷେତ୍ର ସହ ସୋପିବାକୁ ଚାହୁଁଛନ୍ତି",
  adminAssignSubmit: "ସୋପନ୍ତୁ",
  adminRolesHeading: "କର୍ମଚାରୀ ଭୂମିକା",
  adminEmpty: "କୌଣସି କର୍ମଚାରୀ ନାହିଁ",
  adminRoleStatus: "ସ୍ଥିତି",
  adminActionReinstate: "ପୁନର୍ବାର କର୍ମରେ ନେବୁ",
  adminActionSuspend: "ଅସ୍ଥାୟୀ ରହନ୍ତୁ",
  adminActionRevoke: "ଅଧିକାର ବାତିଲ କରନ୍ତୁ",
  adminAuditHeading: "କର୍ମଚାରୀ ବିବରଣୀ",
  adminAuditEmpty: "କୌଣସି ବିବରଣୀ ନାହିଁ",
  adminNoAccess: "କର୍ମଚାରୀ ପ୍ରବେଶ ନାହିଁ",
  adminNoAccessHint: "ଆପଣଙ୍କ ଏକାଉଣ୍ଠିରେ କୌଣସି କର୍ମଚାରୀ ସେଟିଙ୍ଗ ନାହିଁ",
  adminConfirmRevoke: "ପୁନର୍ବାର ସହମତି ଦିଅନ୍ତୁ",
};

export function t3(lang: Language, key: keyof Part3Dict, vars?: Record<string, string | number>): string {
  const value = lang === "hi" ? hi[key] : lang === "or" ? or[key] : en[key];
  if (!value) return key;
  if (!vars) return value;
  let result = value;
  for (const [name, val] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${name}\\}`, "g"), String(val));
  }
  return result;
}

export function hasPart3(lang: Language, key?: keyof Part3Dict): boolean {
  const dict = lang === "hi" ? hi : lang === "or" ? or : en;
  if (key !== undefined) return Boolean(dict[key]);
  return lang === "en" || lang === "hi" || lang === "or";
}
