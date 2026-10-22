
import { useNavigate } from "react-router";
import "./styles/landingPage.css";
import { useState, useEffect } from "react";


export function LandingPage() {

   const [ btnText, setBtnText ] = useState("Create Room");
   const [ btnDisabled, setBtnDisaled ] = useState(false);
 
   const navigate = useNavigate();


  async function handleCreateRoom() {
     setBtnText("Processing...");
     setBtnDisaled(true);
    try {
     
    /*navigate(`/room/123`);
     return;*/
     const res = await fetch("https://api.domtech.co.ke⁠/create-room");
     const data = await res.json();

     if (data?.successful) {
      localStorage.setItem("isHost", true);
      navigate(`/join-room/${data?.roomId}`);
     } else {
       setBtnText("Create Room");
       setBtnDisaled(false);
       alert("Server error occured");
     }

    } catch(err) {
     setBtnText("Create Room");
     setBtnDisaled(false);
     alert(err.message);
    }
  }


   return (
    <div className="landingPage">

      <header>
       <h1>Audio Spaces</h1>
      </header>

      <main>
       <div>
        <button onClick={handleCreateRoom} disabled={btnDisabled}>{btnText}</button>
       </div>
      </main>

    </div>
  )
 }

