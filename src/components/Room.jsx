
import { useNavigate, useParams } from "react-router";
import React, { useState, useEffect, useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMicrophone, faVideo, faArrowRight, faMicrophoneSlash, faHand } from "@fortawesome/free-solid-svg-icons";
import { faHand as faHandRegular } from "@fortawesome/free-regular-svg-icons";
import "./styles/room.css"
import { device } from "../utils//mediasoup.js";

 export function Room() {
  
 const [ muted, setMuted ] = useState(true);
 const [ handRaised, setHandRaised ] = useState(false);
 const [ participants, setParticipants ] = useState([]);
 const [ participantInfo, setParticipantInfo ] = useState({});
 const [ hostId, setHostId ] = useState(null);
 const { roomId } = useParams();
 
 const participantId = localStorage.getItem("participantId");
 
 let ws = new WebSocket("wss://api.domtech.co.ke⁠");
 let retryTimer;

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


async function startSpeaking() {
  try {
    const sendTransport = sendTransportRef.current;

    if (!sendTransport) {
      alert("Send transport is not ready");
      return;
    }

    //Request microphone access
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false
    });

    localStreamRef.current = stream;
    

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

    audioProducerRef.current = producer;
  } catch (error) {
    console.error("Failed to start speaking:", error);
    alert("Could not start speaking: " + error.message);
  }
}



useEffect(() => {

function connectWebSocket() {

  ws.onopen = () => {
    ws.send(JSON.stringify({
      type: "register",
      participantId: participantId,
      roomId: roomId
    }));
  };

  ws.onclose = () => {
    alert("Internet disconnected.Connection  Retrying...");

    retryTimer = setTimeout(() => {
      connectWebSocket();
    }, 2000);
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
   
    if (data.type === "registered") {
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
    }


    if (data.type === "new-participant") {
      setParticipants((prev) => [data?.participant, ...prev]);
      alert("new person joined");
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



if (data.type === "newProducer") {
  if (data.participantId === participantId) {
    return;
  }

  if (data.kind !== "audio") {
    return;
  }

  if (!device || !device.loaded) {
    console.error("Mediasoup Device is not loaded");
    return;
  }

  if (!recvTransportRef.current) {
    console.error("Receive transport is not ready");
    return;
  }

  ws.send(JSON.stringify({
    type: "consume",
    roomId,
    participantId,
    transportId: recvTransportRef.current.id,
    producerId: data.producerId,
    rtpCapabilities: device.rtpCapabilities
  }));

}









if (data.type === "consumerCreated") {

  if (!data.successful) {
    console.error("Consumer creation failed:", data.message);
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
        alert(
          "Browser blocked audio playback. Tap the page and try again.",
          error
        );
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


    if (data.type === "microphone-update") {
      setParticipants((prev) =>
        prev.map((p) =>
          p?.id === data.participantId
            ? { ...p, microphone: data.status }
            : p
        )
      );
    }

    if (data.type === "hand-update") {
      setParticipants((prev) =>
        prev.map((p) =>
          p?.id === data.participantId
            ? { ...p, hand: data.status }
            : p
        )
      );
    }
  };
}

connectWebSocket();

}, [roomId])

function sendStatus(type, status) {
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


 
 function handleMicrophone() {
  const status = muted ? "unmuted" : "muted";
   startSpeaking();
  sendStatus("microphone", status);
  setMuted(!muted);
 }


function handleRaiseHand() {
  const status = handRaised ? "lowered" : "raised";
  sendStatus("hand", status);
  setHandRaised(!handRaised);
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
     <main>
      <div className="participants">
        <h3>Participants: <span style={{ color: "green" }}>{participants.length}</span></h3>
        <hr />
        {participants.map((p, index) => {

         const tag = p?.name?.trim().split(/\s+/) || [];
         const initials = tag
           .map((name) => name[0])
           .slice(0, 2)
           .join("")
           .toUpperCase();

         return (
          <div className="userInfo" key={index}>
            <div>
              {p.hand === "lowered" ? (
               <span><b>{initials || ""}</b></span>
               ) : ( 
               <FontAwesomeIcon
                 icon={faHand}
                 color="white"
                />
               )}
             </div>
            <p>{p?.name}</p>
            <FontAwesomeIcon
              icon={p?.microphone === "unmuted" ? faMicrophone : faMicrophoneSlash}
              color="grey"
            />
        </div>
         )
       })}


      </div>
      <div className="board">
        <h3>Digital Board</h3>
        <hr />

      </div>
     </main>
     <footer>
       <div>
         <button onClick={handleMicrophone}>
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
         <button>
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
