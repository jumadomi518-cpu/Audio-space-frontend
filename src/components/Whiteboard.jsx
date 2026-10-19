import {
useCallback,
useEffect,
useRef,
useState
} from "react";

import { getStroke } from "perfect-freehand";
import "./styles/whiteboard.css";

let BOARD_WIDTH;
const SECTION_HEIGHT = 500;
const SECTION_COUNT = 200;
const BOARD_HEIGHT = SECTION_HEIGHT * SECTION_COUNT;
const SEND_INTERVAL = 25;

const PEN_WIDTH_RATIO = 0.003;
const ERASER_WIDTH_RATIO = 0.035;

const COLORS = [
"#111827",
"#dc2626",
"#2563eb",
"#16a34a",
"#9333ea",
"#ea580c"
];

const STROKE_OPTIONS = {
thinning: 0,
smoothing: 0.5,
streamline: 0.35,
simulatePressure: false
};

function createStroke(
id,
color,
widthRatio,
erase = false
) {
return {
id,
color,
widthRatio,
erase,
points: [],
cachedOutline: null,
isComplete: false
};
}

function distanceToSegment(point, a, b) {
const dx = b.x - a.x;
const dy = b.y - a.y;

if (dx === 0 && dy === 0) {
return Math.hypot(point.x - a.x, point.y - a.y);
}

const t = Math.max(
0,
Math.min(
1,
(
(point.x - a.x) * dx +
(point.y - a.y) * dy
) / (dx * dx + dy * dy)
)
);

return Math.hypot(
point.x - (a.x + t * dx),
point.y - (a.y + t * dy)
);
}

function pathsIntersect(a, b, radius) {
if (!a.length || !b.length) return false;

for (let i = 0; i < a.length; i++) {
const aStart = a[i];
const aEnd = a[i + 1] || aStart;

for (let j = 0; j < b.length; j++) {
  const bStart = b[j];
  const bEnd = b[j + 1] || bStart;

  if (
    distanceToSegment(aStart, bStart, bEnd) <= radius ||
    distanceToSegment(aEnd, bStart, bEnd) <= radius ||
    distanceToSegment(bStart, aStart, aEnd) <= radius ||
    distanceToSegment(bEnd, aStart, aEnd) <= radius
  ) {
    return true;
  }
}

}

return false;
}

function getStrokeSections(stroke) {
if (!stroke.points.length) return [];

const ys = stroke.points.map(
(point) => point.y * BOARD_WIDTH
);

const padding =
stroke.widthRatio * BOARD_WIDTH + 4;

const minY = Math.max(0, Math.min(...ys) - padding);
const maxY = Math.min(
BOARD_HEIGHT,
Math.max(...ys) + padding
);

const first = Math.max(
0,
Math.floor(minY / SECTION_HEIGHT)
);

const last = Math.min(
SECTION_COUNT - 1,
Math.floor(maxY / SECTION_HEIGHT)
);

const result = [];

for (let i = first; i <= last; i++) {
result.push(i);
}

return result;
}

export default function Whiteboard({
ws,
roomId,
participantId,
canDraw = true
}) {
const scrollRef = useRef(null);

// One canvas for each board section.
const canvasRefs = useRef(new Map());

const strokesRef = useRef([]);
const strokeMapRef = useRef(new Map());

const activeStrokeRef = useRef(null);
const pendingRef = useRef([]);

const drawingRef = useRef(false);
const pointerIdRef = useRef(null);

const colorRef = useRef(COLORS[0]);
const toolRef = useRef("pen");
const modeRef = useRef("draw");

const animationRef = useRef(null);
const dirtySectionsRef = useRef(new Set());

const finishStrokeRef = useRef(null);

const [color, setColor] = useState(COLORS[0]);
const [tool, setTool] = useState("pen");
const [mode, setMode] = useState("draw");
const [boardWidth, setBoardWidth] = useState(window.innerWidth);


useEffect(() => {

   BOARD_WIDTH = window.innerWidth;

  const handleResize = () => {
    BOARD_WIDTH = window.innerWidth;
    setBoardWidth(window.innerWidth);
  };

  window.addEventListener("resize", handleResize);

  return () => window.removeEventListener("resize", handleResize);
}, []);



// -----------------------------------------------
// WebSocket sender: protocol preserved
// -----------------------------------------------

const send = useCallback(
(message) => {
if (
!ws ||
ws.readyState !== WebSocket.OPEN
) {
return false;
}

  ws.send(
    JSON.stringify({
      type: "whiteboard",
      roomId,
      participantId,
      ...message
    })
  );

  return true;
},
[ws, roomId, participantId]

);

// -----------------------------------------------
// Coordinates remain global to the entire board.
// The scroll offset is included, so the correct
// section is selected even after scrolling.
// -----------------------------------------------

/*const getPoint = useCallback((event) => {
const firstCanvas = canvasRefs.current.get(0);
const scroll = scrollRef.current;

if (!firstCanvas || !scroll) return null;

const rect = firstCanvas.getBoundingClientRect();

if (!rect.width) return null;

return {
  x: (event.clientX - rect.left) / rect.width,
  y: (
    event.clientY -
    rect.top +
    scroll.scrollTop
  ) / rect.width,
  pressure:
    event.pressure > 0
      ? event.pressure
      : 0.5
};

}, []);*/

const getPoint = useCallback((event) => {
  const canvas = event.currentTarget;
  const scroll = scrollRef.current;

  if (!canvas || !scroll) return null;

  const rect = canvas.getBoundingClientRect();

  if (!rect.width) return null;

  const sectionIndex = Number(canvas.dataset.section);

  const x = (event.clientX - rect.left) / rect.width;

  const y =
    (
      event.clientY -
      rect.top +
      scroll.scrollTop
    ) / rect.width;

  return {
    x,
    y: y + (sectionIndex * SECTION_HEIGHT) / BOARD_WIDTH,
    pressure: event.pressure > 0 ? event.pressure : 0.5
  };
}, []);


// -----------------------------------------------
// Render one stroke onto one section.
// Points use global board coordinates.
// Canvas clipping handles strokes crossing
// section boundaries.
// -----------------------------------------------

const renderStroke = useCallback(
(stroke, sectionIndex) => {
const canvas = canvasRefs.current.get(sectionIndex);

  if (!canvas || !stroke.points.length) return;

  const ctx = canvas.getContext("2d");

  if (!ctx) return;

  const scale = BOARD_WIDTH;
  const sectionTop = sectionIndex * SECTION_HEIGHT;
  const width = stroke.widthRatio * scale;

  ctx.save();

  // Translate global board coordinates into
  // this canvas section's local coordinates.
  ctx.translate(0, -sectionTop);

  ctx.globalCompositeOperation = stroke.erase
    ? "destination-out"
    : "source-over";

  ctx.fillStyle = stroke.color;

  if (stroke.points.length === 1) {
    const point = stroke.points[0];

    ctx.beginPath();
    ctx.arc(
      point.x * scale,
      point.y * scale,
      width / 2,
      0,
      Math.PI * 2
    );
    ctx.fill();

    ctx.restore();
    return;
  }

  const isActive =
    activeStrokeRef.current === stroke ||
    !stroke.isComplete;

  let outline = stroke.cachedOutline;

  if (!outline || isActive) {
    const inputPoints = stroke.points.map(
      (point) => [
        point.x * scale,
        point.y * scale,
        point.pressure ?? 0.5
      ]
    );

    outline = getStroke(inputPoints, {
      ...STROKE_OPTIONS,
      size: width,
      last: !isActive
    });

    if (!isActive) {
      stroke.cachedOutline = outline;
    }
  }

  if (outline.length) {
    ctx.beginPath();
    ctx.moveTo(outline[0][0], outline[0][1]);

    for (let i = 1; i < outline.length; i++) {
      ctx.lineTo(outline[i][0], outline[i][1]);
    }

    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
},
[]

);

// -----------------------------------------------
// Redraw only the requested sections.
// No need to clear the entire 20,000px board
// on every pointer movement.
// -----------------------------------------------

const redrawSection = useCallback(
(sectionIndex) => {
const canvas = canvasRefs.current.get(sectionIndex);

  if (!canvas) return;

  const ctx = canvas.getContext("2d");

  if (!ctx) return;

  ctx.clearRect(
    0,
    0,
    canvas.width,
    canvas.height
  );

  for (const stroke of strokesRef.current) {
    if (getStrokeSections(stroke).includes(sectionIndex)) {
      renderStroke(stroke, sectionIndex);
    }
  }
},
[renderStroke]

);

const scheduleRedraw = useCallback(
(sections = null) => {
if (sections === null) {
for (let i = 0; i < SECTION_COUNT; i++) {
dirtySectionsRef.current.add(i);
}
} else {
for (const index of sections) {
if (index >= 0 && index < SECTION_COUNT) {
dirtySectionsRef.current.add(index);
}
}
}

  if (animationRef.current !== null) return;

  animationRef.current = requestAnimationFrame(() => {
    animationRef.current = null;

    const dirty = [
      ...dirtySectionsRef.current
    ];

    dirtySectionsRef.current.clear();

    for (const index of dirty) {
      redrawSection(index);
    }
  });
},
[redrawSection]

);

// -----------------------------------------------
// Eraser
// -----------------------------------------------

const applyEraser = useCallback(
(eraserPoints, widthRatio) => {
if (!eraserPoints.length) return;

  const radius = widthRatio / 2;
  const affected = new Set();

  // Remember the sections occupied by each
  // removed stroke so they can be redrawn.
  strokesRef.current = strokesRef.current.filter(
    (stroke) => {
      if (stroke.erase || !stroke.points.length) {
        return true;
      }

      const intersects = pathsIntersect(
        eraserPoints,
        stroke.points,
        radius + stroke.widthRatio / 2
      );

      if (intersects) {
        for (const section of getStrokeSections(stroke)) {
          affected.add(section);
        }

        return false;
      }

      return true;
    }
  );

  // Also redraw sections traversed by the eraser.
  const eraserStroke = {
    points: eraserPoints,
    widthRatio
  };

  for (const section of getStrokeSections(eraserStroke)) {
    affected.add(section);
  }

  strokeMapRef.current = new Map(
    strokesRef.current.map((stroke) => [
      stroke.id,
      stroke
    ])
  );

  scheduleRedraw([...affected]);
},
[scheduleRedraw]

);

// -----------------------------------------------
// Send accumulated points
// -----------------------------------------------

const flushPoints = useCallback(() => {
const active = activeStrokeRef.current;

if (!active || !pendingRef.current.length) {
  return;
}

if (!ws || ws.readyState !== WebSocket.OPEN) {
  return;
}

const points = pendingRef.current.splice(
  0,
  pendingRef.current.length
);

if (active.erase) {
  send({
    action: "erase",
    strokeId: active.id,
    points,
    widthRatio: active.widthRatio
  });
} else {
  send({
    action: "points",
    strokeId: active.id,
    points,
    color: active.color,
    widthRatio: active.widthRatio
  });
}

}, [ws, send]);

useEffect(() => {
const timer = setInterval(
flushPoints,
SEND_INTERVAL
);

return () => clearInterval(timer);

}, [flushPoints]);

// -----------------------------------------------
// Finish drawing
// -----------------------------------------------

const handlePointerUp = useCallback(
(event) => {
if (!drawingRef.current) return;

  if (
    event &&
    pointerIdRef.current !== null &&
    event.pointerId !== undefined &&
    event.pointerId !== pointerIdRef.current
  ) {
    return;
  }

  const active = activeStrokeRef.current;

  flushPoints();

  if (active) {
    if (active.erase) {
      send({
        action: "erase",
        strokeId: active.id,
        points: [],
        widthRatio: active.widthRatio,
        final: true
      });
    } else {
      send({
        action: "end",
        strokeId: active.id,
        color: active.color,
        widthRatio: active.widthRatio
      });
    }

    active.isComplete = true;
    active.cachedOutline = null;

    scheduleRedraw(getStrokeSections(active));
  }

  drawingRef.current = false;
  activeStrokeRef.current = null;
  pendingRef.current = [];
  pointerIdRef.current = null;
},
[flushPoints, send, scheduleRedraw]

);

useEffect(() => {
finishStrokeRef.current = handlePointerUp;

return () => {
  finishStrokeRef.current = null;
};

}, [handlePointerUp]);

// -----------------------------------------------
// Start drawing
// -----------------------------------------------

const handlePointerDown = useCallback(
(event) => {
if (
!canDraw ||
modeRef.current !== "draw" ||
drawingRef.current
) {
return;
}

  event.preventDefault();

  const point = getPoint(event);

  if (!point) return;

  try {
    event.currentTarget.setPointerCapture(
      event.pointerId
    );
  } catch {
    // Continue if pointer capture is unavailable.
  }

  pointerIdRef.current = event.pointerId;
  drawingRef.current = true;

  const erase = toolRef.current === "eraser";

  const stroke = createStroke(
    `${participantId}-${Date.now()}-${Math.random()}`,
    colorRef.current,
    erase ? ERASER_WIDTH_RATIO : PEN_WIDTH_RATIO,
    erase
  );

  stroke.points.push(point);

  activeStrokeRef.current = stroke;
  pendingRef.current = [];

  if (erase) {
    applyEraser([point], stroke.widthRatio);
  } else {
    strokesRef.current.push(stroke);
    strokeMapRef.current.set(stroke.id, stroke);

    scheduleRedraw(getStrokeSections(stroke));
  }

  send({
    action: "start",
    strokeId: stroke.id,
    color: stroke.color,
    widthRatio: stroke.widthRatio,
    erase: stroke.erase,
    points: [point]
  });
},
[
  canDraw,
  participantId,
  getPoint,
  applyEraser,
  scheduleRedraw,
  send
]

);

// -----------------------------------------------
// Continue drawing
// -----------------------------------------------

const handlePointerMove = useCallback(
(event) => {
if (
!canDraw ||
!drawingRef.current ||
modeRef.current !== "draw" ||
pointerIdRef.current !== event.pointerId
) {
return;
}

  event.preventDefault();

  const active = activeStrokeRef.current;

  if (!active) return;

  const events =
    typeof event.getCoalescedEvents === "function"
      ? event.getCoalescedEvents()
      : [event];

  const newPoints = [];

  for (const movement of events) {
    const point = getPoint(movement);

    if (!point) continue;

    active.points.push(point);
    pendingRef.current.push(point);
    newPoints.push(point);
  }

  if (!newPoints.length) return;

  if (active.erase) {
    applyEraser(newPoints, active.widthRatio);
  } else {
    // Redraw the sections touched by this stroke,
    // including earlier sections if it spans them.
    scheduleRedraw(getStrokeSections(active));
  }
},
[
  canDraw,
  getPoint,
  applyEraser,
  scheduleRedraw
]

);

// -----------------------------------------------
// Receive remote participants' strokes.
// Incoming points use the same global coordinate
// system, so they render in the correct section.
// -----------------------------------------------

useEffect(() => {

if (!ws) return;

function handleMessage(event) {
  let data;

  try {
    data = JSON.parse(event.data);
  } catch {
    return;
  }

  if (data.type !== "whiteboard") return;
  if (data.roomId !== roomId) return;

  if (data.participantId === participantId) {
    return;
  }

  if (data.action === "clear") {
    alert("clear")
    strokesRef.current = [];
    strokeMapRef.current.clear();

    scheduleRedraw();
    return;
  }

  if (data.action === "erase") {
    alert("erase")
    applyEraser(
      data.points || [],
      data.widthRatio || ERASER_WIDTH_RATIO
    );

    return;
  }

  const id = data.strokeId;

  if (!id) return;

  if (data.action === "start") {
    if (data.erase) return;

    if (strokeMapRef.current.has(id)) return;

    const stroke = createStroke(
      id,
      data.color || COLORS[0],
      data.widthRatio || PEN_WIDTH_RATIO
    );

    stroke.points = data.points || [];

    strokesRef.current.push(stroke);
    strokeMapRef.current.set(id, stroke);

    scheduleRedraw(getStrokeSections(stroke));
    return;
  }

  if (data.action === "points") {
    alert("points")
    let stroke = strokeMapRef.current.get(id);

    if (!stroke) {
      stroke = createStroke(
        id,
        data.color || COLORS[0],
        data.widthRatio || PEN_WIDTH_RATIO
      );

      strokesRef.current.push(stroke);
      strokeMapRef.current.set(id, stroke);
    }

    stroke.points.push(...(data.points || []));
    stroke.isComplete = false;
    stroke.cachedOutline = null;

    scheduleRedraw(getStrokeSections(stroke));
    return;
  }

  if (data.action === "end") {
    const stroke = strokeMapRef.current.get(id);

    if (stroke) {
      stroke.isComplete = true;
      stroke.cachedOutline = null;

      scheduleRedraw(getStrokeSections(stroke));
    }
  }
}

ws.addEventListener("message", handleMessage);

return () => {
  ws.removeEventListener("message", handleMessage);
};

}, [
ws,
roomId,
participantId,
applyEraser,
scheduleRedraw
]);

// -----------------------------------------------
// Toolbar
// -----------------------------------------------

const updateMode = useCallback((next) => {
if (next === modeRef.current) return;

if (drawingRef.current) {
  finishStrokeRef.current?.();
}

modeRef.current = next;
setMode(next);

}, []);

const updateTool = useCallback(
(next) => {
toolRef.current = next;
setTool(next);

  updateMode(next === "hand" ? "scroll" : "draw");
},
[updateMode]

);

const selectColor = useCallback(
(next) => {
colorRef.current = next;
setColor(next);

  updateTool("pen");
},
[updateTool]

);

const clearBoard = useCallback(() => {
if (!canDraw) return;

if (drawingRef.current) {
  finishStrokeRef.current?.();
}

strokesRef.current = [];
strokeMapRef.current.clear();

scheduleRedraw();
send({ action: "clear" });

}, [canDraw, scheduleRedraw, send]);

// -----------------------------------------------
// Cleanup
// -----------------------------------------------

useEffect(() => {
return () => {
if (animationRef.current !== null) {
cancelAnimationFrame(animationRef.current);
}
};
}, []);

// -----------------------------------------------
// UI
// -----------------------------------------------

return (
<div className="whiteboard-app">
<div
className="whiteboard-scroll"
ref={scrollRef}
>
<div className="whiteboard-board">
{Array.from(
{ length: SECTION_COUNT },
(_, index) => (
<canvas
key={index}
data-section={index}
ref={(element) => {
if (element) {
canvasRefs.current.set(index, element);
} else {
canvasRefs.current.delete(index);
}
}}
width={BOARD_WIDTH}
height={SECTION_HEIGHT}
className="whiteboard-canvas"
style={{
borderLeft: "1px solid grey",
touchAction:
canDraw && mode === "draw"
? "none"
: "pan-y"
}}
onPointerDown={handlePointerDown}
onPointerMove={handlePointerMove}
onPointerUp={handlePointerUp}
onPointerCancel={handlePointerUp}
onLostPointerCapture={handlePointerUp}
/>
)
)}
</div>
</div>

  <div className="whiteboard-floating-toolbar">
    {canDraw ? (
      <>
        <div className="whiteboard-colors">
          {COLORS.map((item) => (
            <button
              key={item}
              type="button"
              aria-label={`Select colour ${item}`}
              className={
                "whiteboard-color" +
                (
                  color === item && tool === "pen"
                    ? " selected"
                    : ""
                )
              }
              style={{ backgroundColor: item }}
              onClick={() => selectColor(item)}
            />
          ))}
        </div>

        <div className="whiteboard-tools">
          <button
            type="button"
            className={
              tool === "pen" && mode === "draw"
                ? "active"
                : ""
            }
            onClick={() => updateTool("pen")}
          >
            Pen
          </button>

          <button
            type="button"
            className={
              tool === "eraser" && mode === "draw"
                ? "active"
                : ""
            }
            onClick={() => updateTool("eraser")}
          >
            Eraser
          </button>

          <button
            type="button"
            className={mode === "scroll" ? "active" : ""}
            onClick={() =>
              updateMode(
                modeRef.current === "scroll"
                  ? "draw"
                  : "scroll"
              )
            }
          >
           View
          </button>

          <button type="button" onClick={clearBoard}>
            Clear
          </button>
        </div>
      </>
    ) : (
      <strong>Class whiteboard</strong>
    )}
  </div>
</div>

);
}
