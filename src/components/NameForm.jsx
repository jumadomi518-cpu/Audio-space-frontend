
import "./styles/nameForm.css";
import { useNavigate, useParams } from "react-router";
import { useState } from "react";
import { device } from "../utils//mediasoup.js";

export function NameForm() {
 
 const navigate = useNavigate();
 const { roomId } = useParams();
 const [ name, setName ] = useState("");
 const [ btnText, setBtnText ] = useState("Enter Room");
 const [ btnDisabled, setBtnDisaled ] = useState(false);


 
async function handleEnterRoom(e) {
  e.preventDefault();

  setBtnText("Processing...");
  setBtnDisaled(true);

  try {
    const res = await fetch("http://64.227.45.0:3000/join-room", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: name.trim(),
        roomId: roomId,
        participantId: localStorage.getItem("participantId"),
        isHost: localStorage.getItem("isHost") === "true"
      })
    });

    const data = await res.json();

    if (!res.ok || !data.successful) {
      throw new Error(data.message || "Failed to join room");
    }

    localStorage.setItem("participantId", data.participantId);
    localStorage.removeItem("isHost");


    await device.load({
     routerRtpCapabilities: data.rtpCapabilities
   });    


    navigate(`/room/${roomId}`);

  } catch (err) {
    alert(err.message);

  } finally {
    setBtnText("Enter Room");
    setBtnDisaled(false);
  }
}


 return (
   <div className="nameForm">
     <main>
      <form onSubmit={handleEnterRoom}>
       <label htmlFor="name">Full Name:</label>
       <input value={name} onChange={(e) => setName(e.target.value)} type="text" id="name" placeholder="Full Name" required />
       <button type="submit" disabled={btnDisabled}>{btnText}</button>
      </form>
    </main>
   </div>
 )
}
