
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

    const res = await fetch("https://azure.domtech.co.ke⁠/check-room", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        roomId: roomId,
      })
    });

    const data = await res.json();

    if (!res.ok || !data.exists) {
      alert("The room does not exist");
      return;
    }


    localStorage.setItem("name", name);

    navigate(`/room/${roomId}/`, { replace: true });

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
