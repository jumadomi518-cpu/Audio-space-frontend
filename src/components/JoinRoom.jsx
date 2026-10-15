
 import "./styles/joinRoom.css"
 import { useNavigate, useParams } from "react-router";


 export function JoinRoom() {

 const navigate = useNavigate();
 const { roomId } = useParams();

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

 function handleEnterRoom() {
  navigate(`/full-name/${roomId}`);
 }



 return (
  <div className="joinRoom">
   <main>
     <div>
      <button onClick={handleShare}>Share Link</button>
      <button onClick={handleEnterRoom}>Enter Room</button>
     </div>
   </main>
  </div>
  )
 }
