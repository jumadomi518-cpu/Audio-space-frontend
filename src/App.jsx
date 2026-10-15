
 import { BrowserRouter, Routes, Route } from "react-router";
 import { LandingPage } from "./components/LandingPage.jsx";
 import { JoinRoom } from "./components/JoinRoom.jsx"
 import { NameForm } from "./components/NameForm.jsx"
 import { Room } from "./components/Room.jsx"

 function App() {
   return (
   <>
    <BrowserRouter>
     <Routes>

       <Route path="/" element={<LandingPage />} />
       <Route path="/join-room/:roomId" element={<JoinRoom />} />
       <Route path="/full-name/:roomId" element={<NameForm />} />
       <Route path="/room/:roomId" element={<Room />} />

     </Routes>
    </BrowserRouter>
   </>
   )
 }

 export default App;
