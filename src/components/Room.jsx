
import { useNavigate, useParams } from "react-router";
import React, { useState, useEffect, useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMicrophone, faVideo, faArrowRight, faMicrophoneSlash, faHand, faMessage } from "@fortawesome/free-solid-svg-icons";
import { faHand as faHandRegular } from "@fortawesome/free-regular-svg-icons";
import "./styles/room.css"
import { Device } from "mediasoup-client";
import { Spinner } from "./Spinner.jsx"
import Whiteboard from "../components/Whiteboard";


 export function Room() {
  
 const [ muted, setMuted ] = useState(true);
 const [ handRaised, setHandRaised ] = useState(false);
 const [ micDisabled, setMicDisabled ] = useState(false);
 const [ handDisabled, setHandDisabled ] = useState(false);
 const [ loading, setLoading ] = useState(false);
 const [ roomAction, setRoomAction ] = useState("loading...");

 const [ participants, setParticipants ] = useState([]);
 const [ participantInfo, setParticipantInfo ] = useState({});
 const [ hostId, setHostId ] = useState(null);
 const { roomId } = useParams();
 const [ loadingRoom, setLoadingRoom ] = useState(true);
 const [ spinnerInfo, setSpinnerInfo ] = useState("Etablishing connection");
 const [ showEnableAudio, setShowEnableAudio ] = useState(false);
 const [ audioEnabled, setAudioEnabled ] = useState(
  sessionStorage.getItem("audioEnabled") === "true"
);
const [ transcript, setTranscript ] = useState("");
const [ liveCaption, setLiveCaption ] = useState("");

const [ showKSL, setShowKSL ] = useState(false);

 const navigate = useNavigate();
 
 const participantId = localStorage.getItem("participantId") || null;
 const name = localStorage.getItem("name");
 const isHost = localStorage.getItem("isHost") === "true";








 const wsRef = useRef(null);
 const retryTimerRef = useRef(null);


 const sendTransportRef = useRef(null);
 const recvTransportRef = useRef(null);
 const connectCallbackRef = useRef(null);
 const connectErrbackRef = useRef(null);

 const sendConnectCallbackRef = useRef(null);
 const sendConnectErrbackRef = useRef(null);
 const produceCallbackRef = useRef(null);
 const produceErrbackRef = useRef(null);

 const audioProducerRef = useRef(null);
 const localStreamRef = useRef(null);

 const deviceRef = useRef(null);
 const consumersRef = useRef(new Map());
 const audioElementsRef = useRef(new Map());


 const audioContextRef = useRef(null);
 const speakingRef = useRef(false);
 const animationFrameRef = useRef(null);


const transcriptionContextRef = useRef(null);
const transcriptionProcessorRef = useRef(null);
const transcriptionSourceRef = useRef(null);
const transcriptionGainRef = useRef(null);

const transcriptionReadyRef = useRef(false);
const pendingTranscriptionAudioRef = useRef([]);

async function startTranscriptionCapture(audioTrack) {
  const ws = wsRef.current;

  if (!ws || ws.readyState !== WebSocket.OPEN) {
    alert("Not connected");
    throw new Error("WebSocket is not connected");
  }

  // Wait for the backend's readiness confirmation.
  transcriptionReadyRef.current = false;
  pendingTranscriptionAudioRef.current = [];

  const context = new AudioContext();
  await context.resume();

  const source = context.createMediaStreamSource(
    new MediaStream([audioTrack])
  );

  const processor = context.createScriptProcessor(4096, 1, 1);
  const silentGain = context.createGain();

  silentGain.gain.value = 0;

  processor.onaudioprocess = (event) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (!transcriptionReadyRef.current) return;


    const input = event.inputBuffer.getChannelData(0);
    const inputRate = context.sampleRate;

    const outputLength = Math.floor(
      input.length * 16000 / inputRate
    );

    const pcm = new Int16Array(outputLength);

    for (let i = 0; i < outputLength; i++) {
      const position = i * inputRate / 16000;
      const index = Math.floor(position);
      const fraction = position - index;

      const first = input[index] || 0;
      const second = input[index + 1] ?? first;

      const sample = first + (second - first) * fraction;
      const clamped = Math.max(-1, Math.min(1, sample));

      pcm[i] = clamped < 0
        ? clamped * 32768
        : clamped * 32767;
    }

    const audioChunk = pcm.buffer;

    if (!transcriptionReadyRef.current) {
      const queue = pendingTranscriptionAudioRef.current;

      // Keep at most about two seconds of audio.
      if (queue.length >= 24) {
        queue.shift();
      }

      queue.push(audioChunk);
      return;
    }

    if (ws.bufferedAmount <= 256 * 1024) {
      ws.send(audioChunk);
    }
  };

  source.connect(processor);
  processor.connect(silentGain);
  silentGain.connect(context.destination);

  transcriptionContextRef.current = context;
  transcriptionSourceRef.current = source;
  transcriptionProcessorRef.current = processor;
  transcriptionGainRef.current = silentGain;
}
  
      


 if (!deviceRef.current) {
  deviceRef.current = new Device();
}

const device = deviceRef.current;


async function enableAudio() {
  try {
    const audios = [...audioElementsRef.current.values()];

    await Promise.all(
      audios.map(async (audio) => {
        try {
          await audio.play();
        } catch (error) {
          console.warn("Audio still blocked:", error);
        }
      })
    );


   sessionStorage.setItem("audioEnabled", "true");


    setAudioEnabled(true);
    setShowEnableAudio(false);

  } catch (error) {
    console.error("Audio activation failed:", error);
  }
}


async function handleShare() {
  const roomLink = window.location.href;

  try {
    if (navigator.share) {
      await navigator.share({
        title: "ROOM LINK",
        text: "Click the link to join room:",
        url: `https://audio.domtech.co.ke/full-name/${roomId}`
      });
    } else {
      await navigator.clipboard.writeText(roomLink);
      alert("Room link copied!");
    }
  } catch (err) {
    if (err.name !== "AbortError") {
      console.error("Sharing failed:", err);
    }
  }
}

function resetWebRTCState() {
  // Close old microphone producer
  audioProducerRef.current?.close();
  audioProducerRef.current = null;

  // Close old consumers
  for (const consumer of consumersRef.current.values()) {
    consumer.close();
  }

  consumersRef.current.clear();

  // Remove old audio elements
  for (const audio of audioElementsRef.current.values()) {
    audio.pause();
    audio.srcObject = null;
  }

  audioElementsRef.current.clear();

  // Clear producer tracking
  consumingProducers.current.clear();

  // Close old transports
  sendTransportRef.current?.close();
  recvTransportRef.current?.close();

  sendTransportRef.current = null;
  recvTransportRef.current = null;

  // Clear pending callbacks
  connectCallbackRef.current = null;
  connectErrbackRef.current = null;

  sendConnectCallbackRef.current = null;
  sendConnectErrbackRef.current = null;

  produceCallbackRef.current = null;
  produceErrbackRef.current = null;
}


function detectSpeaking(stream) {
  const audioContext = new AudioContext();
  audioContextRef.current = audioContext;

  const source = audioContext.createMediaStreamSource(stream);
  const analyser = audioContext.createAnalyser();

  analyser.fftSize = 512;
  source.connect(analyser);

  const data = new Uint8Array(analyser.fftSize);

  function checkVolume() {
    analyser.getByteTimeDomainData(data);

    let sum = 0;

    for (const value of data) {
      const normalized = (value - 128) / 128;
      sum += normalized * normalized;
    }

    const volume = Math.sqrt(sum / data.length);
    const isSpeaking = volume > 0.04;

    if (isSpeaking !== speakingRef.current) {
      speakingRef.current = isSpeaking;

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: "speaking-update",
          roomId,
          participantId,
          speaking: isSpeaking
        }));
      }
    }

    animationFrameRef.current =
      requestAnimationFrame(checkVolume);
  }

  checkVolume();
}



async function startSpeaking() {

console.log("[MIC] Starting microphone...");

  try {
     if (audioProducerRef.current &&
        !audioProducerRef.current.closed) {
      return audioProducerRef.current;
    }

    const sendTransport = sendTransportRef.current;

    if (!sendTransport) {
      alert("An error occured. Please exit room and join again");
      return;
    }

    //Request microphone access
 const stream = await navigator.mediaDevices.getUserMedia({
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true
  },
  video: false
});

console.log("[MIC] Permission granted:", {
  tracks: stream.getAudioTracks().length,
  state: stream.getAudioTracks()[0]?.readyState,
  enabled: stream.getAudioTracks()[0]?.enabled
});

    localStreamRef.current = stream;
  
     detectSpeaking(stream);  
  
    //Get the microphone audio track
    const audioTrack = stream.getAudioTracks()[0];


    if (!audioTrack) {
      alert("No microphone audio track found");
      return;
    }

    //Create the producer
    const producer = await sendTransport.produce({
      track: audioTrack
    });

console.log("[PRODUCER] Created:", {
  id: producer.id,
  kind: producer.kind,
  paused: producer.paused
});

    audioProducerRef.current = producer;

    await startTranscriptionCapture(audioTrack);


    producer.on("transportclose", () => {
      if (audioProducerRef.current === producer) {
        audioProducerRef.current = null;
      }
    });

    return producer;
  } catch (error) {
    console.error("Failed to start speaking:", error);
    alert(error.message);
  }
}


const consumingProducers = useRef(new Set());

const consumeProducer = (producerData) => {
 if (producerData.participantId === participantId) return;
  const ws = wsRef.current;


  if (producerData.kind !== "audio") return;

  if (!device?.loaded || !recvTransportRef.current) return;

  if (consumingProducers.current.has(producerData.producerId)) return;

  consumingProducers.current.add(producerData.producerId);

  ws.send(JSON.stringify({
    type: "consume",
    roomId,
    participantId,
    transportId: recvTransportRef.current.id,
    producerId: producerData.producerId,
    rtpCapabilities: device.rtpCapabilities
  }));
};



useEffect(() => {

async function connectWebSocket() {

  const ws = new WebSocket("wss://azure.domtech.co.ke");

  wsRef.current = ws;


  ws.onopen = () => {
    setSpinnerInfo("Setting up Room");
    ws.send(JSON.stringify({
      type: "register",
      name: name,
      isHost: isHost,
      participantId: participantId,
      roomId: roomId
    }));
  };

  ws.onclose = () => {

    resetWebRTCState();

    setSpinnerInfo("Disconnected. Check your internet connection.");
    setLoadingRoom(true);


    retryTimer = setTimeout(() => {
      connectWebSocket();
    }, 2000);
  };

  ws.onmessage = async (event) => {
    const data = JSON.parse(event.data);
   
    if (data.type === "registered") {

    const participantId = data.participantId;


  if (!participantId) {
    console.error("Registration failed: participantId is missing");
    return;
  }

  
  localStorage.setItem("participantId", participantId);

    consumingProducers.current.clear();

  if (!device.loaded) {
    await device.load({
      routerRtpCapabilities: data.rtpCapabilities
    });
  }

     ws.send(JSON.stringify({
      type: "get-room-state",
      participantId: participantId,
      roomId: roomId
    }));

 ws.send(JSON.stringify({
   type: "createWebRtcTransport",
   roomId: roomId,
   participantId: participantId,
   direction: "recv"
  }));

ws.send(JSON.stringify({
   type: "createWebRtcTransport",
   roomId: roomId,
   participantId: participantId,
   direction: "send"
  }));



}

























    // Refresh the participant list after reconnecting
    if (data.type === "room-state") {
      setParticipants(data.participants);
      const user = data.participants.find(p => p.id === participantId);
      setMuted(user?.microphone === "muted");
      setHandRaised(user?.hand === "raised");
      setParticipantInfo(user);
      const host = data.participants.find(p => p.isHost === true);
      setHostId(host?.id);
      setSpinnerInfo("Your Room is ready");
      setLoadingRoom(false);
    }


    if (data.type === "new-participant") {
      setParticipants((prev) => [data?.participant, ...prev]);
    }




  if (data.type === "webRtcTransportCreated") {

  if (data.direction === "recv") {
    const recvTransport = device.createRecvTransport({
      id: data.id,
      iceParameters: data.iceParameters,
      iceCandidates: data.iceCandidates,
      dtlsParameters: data.dtlsParameters
    });

    recvTransportRef.current = recvTransport

    recvTransport.on(
      "connect",
      ({ dtlsParameters }, callback, errback) => {
        
        connectCallbackRef.current = callback;
        connectErrbackRef.current = errback;

        ws.send(JSON.stringify({
          type: "connectTransport",
          roomId,
          participantId,
          transportId: recvTransport.id,
          dtlsParameters
        }));
      }
    );


    ws.send(JSON.stringify({
     type: "getProducers",
     roomId,
     participantId
   }));


  }


  if (data.direction === "send") {

  const sendTransport = device.createSendTransport({
    id: data.id,
    iceParameters: data.iceParameters,
    iceCandidates: data.iceCandidates,
    dtlsParameters: data.dtlsParameters
  });

  sendTransportRef.current = sendTransport;


  //Connect the send transport
  sendTransport.on(
    "connect",
    ({ dtlsParameters }, callback, errback) => {

      ws.send(JSON.stringify({
        type: "connectTransport",
        roomId,
        participantId,
        transportId: sendTransport.id,
        dtlsParameters
      }));

      sendConnectCallbackRef.current = callback;
      sendConnectErrbackRef.current = errback;
    }
  );

  //Ask the backend to create the producer
  sendTransport.on(
    "produce",
    ({ kind, rtpParameters }, callback, errback) => {
      produceCallbackRef.current = callback;
      produceErrbackRef.current = errback;

      ws.send(JSON.stringify({
        type: "produce",
        roomId,
        participantId,
        transportId: sendTransport.id,
        kind,
        rtpParameters
      }));
    }
  );

}
  

 }


if (data.type === "transportConnected") {

  const isSendTransport =
    data.transportId === sendTransportRef.current?.id;

  const callbackRef = isSendTransport
    ? sendConnectCallbackRef
    : connectCallbackRef;

  const errbackRef = isSendTransport
    ? sendConnectErrbackRef
    : connectErrbackRef;

  if (data.successful) {
    callbackRef.current?.();
  } else {
    errbackRef.current?.(
      new Error(data.error || "Transport connection failed")
    );
  }


  callbackRef.current = null;
  errbackRef.current = null;
}
 

if (data.type === "producerCreated") {
  if (data.successful && data.producerId) {
    produceCallbackRef.current?.({
      id: data.producerId
    });

    console.log("Producer created:", data.producerId);
  } else {
    produceErrbackRef.current?.(
      new Error(data.message || "Producer creation failed")
    );
  }

  produceCallbackRef.current = null;
  produceErrbackRef.current = null;
}


if (data.type === "existingProducers") {

  data.producers.forEach(producer => {
    consumeProducer(producer);
  });

}






if (data.type === "newProducer") {
 consumeProducer(data);
}









if (data.type === "consumerCreated") {

  if (!data.successful) {
    alert("Consumer creation failed:", data.message);
    return;
  }

  (async () => {
    try {
      const recvTransport = recvTransportRef.current;

      if (!recvTransport) {
        throw new Error("Receive transport is not ready");
      }


      // Create the local mediasoup-client consumer.
      const consumer = await recvTransport.consume({
        id: data.consumerId,
        producerId: data.producerId,
        kind: data.kind,
        rtpParameters: data.rtpParameters
      });

      consumersRef.current.set(consumer.id, consumer);


     

      // Attach the incoming audio track.
      const stream = new MediaStream([consumer.track]);
      const audio = new Audio();

      audio.autoplay = true;
      audio.srcObject = stream;

      audioElementsRef.current.set(consumer.id, audio);

      // Ask the backend to resume the paused server-side consumer.
      ws.send(JSON.stringify({
        type: "resumeConsumer",
        roomId,
        participantId,
        consumerId: data.consumerId
      }));

      // Attempt to play the incoming audio.

        try {
          await audio.play();
        } catch (error) {
         console.warn("Audio playback failed:", error);
         alert("Audio failed due to browser Restriction");
         setAudioEnabled(false);
        }
       

      // Clean up when the consumer or its transport closes.
      const cleanup = () => {
        audio.pause();
        audio.srcObject = null;

        consumersRef.current.delete(consumer.id);
        audioElementsRef.current.delete(consumer.id);
      };

      consumer.on("transportclose", cleanup);
      consumer.on("producerclose", cleanup);

    } catch (error) {
      alert("Failed to set up incoming audio:", error);
    }
  })();
}


if (data.type === "participantLeft") {
  setParticipants((prev) =>
    prev.filter((p) => p.id !== data.participantId)
  );
}



if (data.type === "microphone-update") {

  if (participantId === data?.participantId) {
    setMuted(data.status === "muted");
  }

  setParticipants((prev) =>
    prev
      .map((p) =>
        p?.id === data.participantId
          ? { ...p, microphone: data.status }
          : p
      )
      .sort((a, b) => {
        if (a.microphone === "unmuted" && b.microphone !== "unmuted") {
          return -1;
        }

        if (a.microphone !== "unmuted" && b.microphone === "unmuted") {
          return 1;
        }

        return 0;
      })
  );
}

    if (data.type === "hand-update") {
      
      if (participantId === data?.participantId) {
         setHandRaised(data.status === "raised");
      }

  setParticipants((prev) =>
  prev
    .map((p) =>
      p?.id === data.participantId
        ? { ...p, hand: data.status }
        : p
    )
    .sort((a, b) =>
      (b.hand === "raised" ? 1 : 0) -
      (a.hand === "raised" ? 1 : 0)
    )
  );
 }

if (data.type === "transcription-ready") {
  
  if (data.ready && data.roomId === roomId) {
    transcriptionReadyRef.current = true;
    const ws = wsRef.current;
    const queuedAudio = pendingTranscriptionAudioRef.current;

    pendingTranscriptionAudioRef.current = [];


    for (const chunk of queuedAudio) {
      if (
        ws?.readyState === WebSocket.OPEN &&
        ws.bufferedAmount <= 256 * 1024
      ) {
        ws.send(chunk);
      }
    }
  } else {
    transcriptionReadyRef.current = false;
    console.error("[TRANSCRIPTION] Backend failed to initialize");
  }

  return;
}



if (data.type === "transcription") {

  if (data.isFinal) {
    setTranscript(prev =>
      `${prev} ${data.transcript}`.trim()
    );
    setLiveCaption(data.transcript);
  } else {
    setLiveCaption(data.transcript);
  }
}


if (data.type === "speaking-update") {
  setParticipants(prev =>
    prev.map(participant =>
      participant.id === data.participantId
        ? {
            ...participant,
            speaking: data.speaking
          }
        : participant
    )
  );
}


  };
}

connectWebSocket();

}, [roomId])

function sendStatus(type, status) {

  const ws = wsRef.current;

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      participantId: participantId,
      roomId: roomId,
      type: type,
      status: status
    }));

  } else {
    console.log("WebSocket is not connected");
  }
}


async function handleMicrophone() {
  try {
    let producer = audioProducerRef.current;

    if (muted) {
      // Create the producer if it doesn't exist
      if (!producer || producer.closed) {
        producer = await startSpeaking();
      }

      if (!producer) {
       return;
      }


      // Resume audio locally
      await producer.resume();

      // Update the UI after local success
      // setMuted(false);

      // Notify backend
      sendStatus("microphone", "unmuted");

    } else {
      if (producer && !producer.closed) {
        await producer.pause();
      }

      setMuted(true);

     
      transcriptionReadyRef.current = false;

      sendStatus("microphone", "muted");
    }

  } catch (error) {
    console.error("Microphone toggle failed:", error);

    alert(error.message);
  }
}


function handleRaiseHand() {
  const status = handRaised ? "lowered" : "raised";
  sendStatus("hand", status);
}

function handleLeaveRoom() {
 const ws = wsRef.current;
 const con = confirm("Are you sure you want to leave");

 if (!con) {
  return;
 }

 ws.send(JSON.stringify({
      participantId: participantId,
      roomId: roomId,
      type: "leave-room"
    }));
 navigate(`/full-name/${roomId}`, { replace: true });
}


useEffect(() => {
  const audio = new Audio("/audio.m4a");
  if (participants.length === 1) {
   // audio.play();
  }
  return () => {
    audio.pause();
    audio.currentTime = 0;
  };

}, [participants]);







  return (
   <div className="room">
    {loadingRoom && (
     <div className="overlay">
       <div className="spinnerContainer">
         <Spinner />
          <p>{spinnerInfo}</p>
       </div>
     </div>)}

    {showEnableAudio && (
     <div className="overlay">
       <div className="spinnerContainer">
         <button onClick={enableAudio} className="audioBtn">Enable Audio</button>
       </div>
     </div>)}

     <main>

  <div className="participants">
    <h3>
      Participants:{" "}
      <span style={{ color: "green" }}>
        {participants.length > 0 ? participants.length : "..."}
      </span>
    </h3>

    <hr />

    {participants.map((p, index) => {
      const initials =
        p?.name?.trim().split(/\s+/)[0]?.[0]?.toUpperCase() || "";

      return (
        <div className="userInfo" key={index}>
          <div className={p?.speaking ? "speakingIndicator" : ""}>
            {p.hand === "lowered" ? (
              <span><b>{initials}</b></span>
            ) : (
              <FontAwesomeIcon
                icon={faHand}
                size="1.5"
                color="white"
              />
            )}
          </div>

          <p className="name">{p?.name}</p>

          <FontAwesomeIcon
            icon={p?.microphone === "unmuted" ? faMicrophone : faMicrophoneSlash}
            color="grey"
          />
        </div>
      );
    })}
  </div>

  {/* Digital Board */}
  <div className="board">

    <div className="shareParent">
      <button onClick={handleShare}>Share link</button>
      <h3>Digital Board</h3>
    </div>

    <hr />

    <div className="whiteboardArea">
      <Whiteboard
        ws={wsRef.current}
        roomId={roomId}
        participantId={participantId}
        name={name}
        canDraw={true}
      />
    </div>

    <div className="captions">

      {showKSL && (
        <div className="ksl">
          <div className="kslVideo">
            {/* KSL video */}
            <video
          src="/recording.webm"
          autoPlay
          muted
          loop
          playsInline
        />
          </div>

          <p>{liveCaption || "Captions"}</p>
        </div>
      )}

      <div className="kslBtn">
        <button onClick={() => setShowKSL(prev => !prev)}>
          {showKSL ? "Close KSL" : "KSL"}
        </button>
      </div>

    </div>
  </div>

</main>

     <footer>
      {loading && (
      <div className="action">
      <p>{roomAction}</p>
       </div>)}
       <div>
        {/*<button>
          <FontAwesomeIcon
            icon={faMessage}
            size="2x"
            color="maroon"
          />
         </button>*/}
         <button 
           onClick={handleMicrophone} 
           disabled={micDisabled}>
          {!muted ? (
          <FontAwesomeIcon
            icon={faMicrophone}
            size="2x"
            color="purple"
          />
          ) : (
          <FontAwesomeIcon
            icon={faMicrophoneSlash}
            size="2x"
            color="purple"
          />
          )}
         </button>
         <button onClick={handleRaiseHand}>
          {!handRaised ? (
          <FontAwesomeIcon
            icon={faHandRegular}
            size="2x"
            color="black"
          />
          ) : (
           <FontAwesomeIcon
            icon={faHand}
            size="2x"
            color="purple"
          />
          )}
         </button>
         <button onClick={handleLeaveRoom}>
          <FontAwesomeIcon
            icon={faArrowRight}
            size="2x"
            color="white"
          />
         </button>
       </div>
     </footer>
   </div>
  )
 }
