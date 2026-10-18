
import {
  useCallback,
  useEffect,
  useRef,
  useState
} from "react";

import "./styles/whiteboard.css";

const BOARD_WIDTH = 1000;
const INITIAL_HEIGHT = 6000;
const EXTEND_BY = 4000;
const SEND_INTERVAL = 25;

// Thickness is proportional to canvas width.
// At 1000 canvas units, the pen is 3 units wide.
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

function createStroke(id, color, widthRatio, erase = false) {
  return {
    id,
    color,
    widthRatio,
    erase,
    points: [],
    state: {
      previous: null,
      midpoint: null
    }
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
      ((point.x - a.x) * dx + (point.y - a.y) * dy) /
        (dx * dx + dy * dy)
    )
  );

  const x = a.x + t * dx;
  const y = a.y + t * dy;

  return Math.hypot(point.x - x, point.y - y);
}

function pathsIntersect(a, b, radius) {
  if (!a.length || !b.length) return false;

  // Handle taps and single-point paths.
  if (a.length === 1) {
    for (let i = 0; i < b.length; i++) {
      const start = b[i];
      const end = b[i + 1] || start;

      if (distanceToSegment(a[0], start, end) <= radius) {
        return true;
      }
    }
  }

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

export default function Whiteboard({
  ws,
  roomId,
  participantId,
  canDraw = true
}) {
  const canvasRef = useRef(null);
  const scrollRef = useRef(null);

  // Keep strokes as data so they can be erased and redrawn.
  const strokesRef = useRef([]);
  const strokeMapRef = useRef(new Map());

  const activeStrokeRef = useRef(null);
  const pendingRef = useRef([]);
  const drawingRef = useRef(false);
  const filterRef = useRef(null);

  const colorRef = useRef(COLORS[0]);
  const toolRef = useRef("pen");
  const modeRef = useRef("draw");

  const [color, setColor] = useState(COLORS[0]);
  const [tool, setTool] = useState("pen");
  const [mode, setMode] = useState("draw");

  const updateMode = (next) => {
    modeRef.current = next;
    setMode(next);
  };

  const updateTool = (next) => {
    toolRef.current = next;
    setTool(next);
    updateMode(next === "hand" ? "scroll" : "draw");
  };

  const selectColor = (next) => {
    colorRef.current = next;
    setColor(next);
    updateTool("pen");
  };

 
  //Preserves proportions as the canvas gets wider.
  const getPoint = useCallback((event) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();

    return {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.width
    };
  }, []);

  const filterPoint = useCallback((point) => {
    const previous = filterRef.current;

    if (!previous) {
      filterRef.current = point;
      return point;
    }

    // Light smoothing to reduce touch jitter.
    const amount = 0.72;

    const result = {
      x: previous.x + (point.x - previous.x) * amount,
      y: previous.y + (point.y - previous.y) * amount
    };

    filterRef.current = result;
    return result;
  }, []);

  const renderStroke = useCallback((stroke) => {
    const canvas = canvasRef.current;
    if (!canvas || !stroke.points.length) return;

    const ctx = canvas.getContext("2d");
    const scale = canvas.width;
    const width = stroke.widthRatio * scale;
    const points = stroke.points;

    ctx.save();

    // Eraser strokes are applied to the stored drawing.
    ctx.globalCompositeOperation = stroke.erase
      ? "destination-out"
      : "source-over";

    ctx.strokeStyle = stroke.color;
    ctx.fillStyle = stroke.color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (points.length === 1) {
      ctx.beginPath();
      ctx.arc(
        points[0].x * scale,
        points[0].y * scale,
        width / 2,
        0,
        Math.PI * 2
      );
      ctx.fill();
      ctx.restore();
      return;
    }

    ctx.beginPath();
    ctx.moveTo(
      points[0].x * scale,
      points[0].y * scale
    );

    if (points.length === 2) {
      ctx.lineTo(
        points[1].x * scale,
        points[1].y * scale
      );
    } else {
      for (let i = 1; i < points.length - 1; i++) {
        const current = points[i];
        const next = points[i + 1];

        ctx.quadraticCurveTo(
          current.x * scale,
          current.y * scale,
          ((current.x + next.x) / 2) * scale,
          ((current.y + next.y) / 2) * scale
        );
      }

      const last = points[points.length - 1];

      ctx.lineTo(
        last.x * scale,
        last.y * scale
      );
    }

    ctx.stroke();
    ctx.restore();
  }, []);

  // Redraw in order, so erasing removes whole stored strokes.
  const redrawBoard = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const stroke of strokesRef.current) {
      renderStroke(stroke);
    }
  }, [renderStroke]);

  const send = useCallback((message) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    ws.send(JSON.stringify({
      type: "whiteboard",
      roomId,
      participantId,
      ...message
    }));

    return true;
  }, [ws, roomId, participantId]);

  const applyEraser = useCallback((eraserPoints, widthRatio) => {
    if (!eraserPoints.length) return;

    const radius = widthRatio / 2;

    // Remove each complete stroke touched by the eraser path.
    strokesRef.current = strokesRef.current.filter((stroke) => {
      if (stroke.erase || !stroke.points.length) return true;

      const strokeRadius = stroke.widthRatio / 2;

      return !pathsIntersect(
        eraserPoints,
        stroke.points,
        radius + strokeRadius
      );
    });

    strokeMapRef.current = new Map(
      strokesRef.current.map((stroke) => [stroke.id, stroke])
    );

    redrawBoard();
  }, [redrawBoard]);

  const flushPoints = useCallback(() => {
    const active = activeStrokeRef.current;

    if (!active || !pendingRef.current.length) return;

    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const points = pendingRef.current.splice(
      0,
      pendingRef.current.length
    );

    if (active.erase) {
      // Eraser path is a command, not a painted white stroke.
      applyEraser(points, active.widthRatio);

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
  }, [ws, send, applyEraser]);

  useEffect(() => {
    const timer = setInterval(flushPoints, SEND_INTERVAL);

    return () => clearInterval(timer);
  }, [flushPoints]);

  const extendBoard = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const oldHeight = canvas.height;
    const snapshot = document.createElement("canvas");

    snapshot.width = canvas.width;
    snapshot.height = oldHeight;

    snapshot.getContext("2d").drawImage(canvas, 0, 0);

    canvas.height = oldHeight + EXTEND_BY;

    canvas.getContext("2d").drawImage(snapshot, 0, 0);
  }, []);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;

    const handleScroll = () => {
      if (
        scroller.scrollTop + scroller.clientHeight >=
        scroller.scrollHeight - 800
      ) {
        extendBoard();
      }
    };

    scroller.addEventListener("scroll", handleScroll);

    return () => {
      scroller.removeEventListener("scroll", handleScroll);
    };
  }, [extendBoard]);

  function handlePointerDown(event) {
    if (!canDraw || modeRef.current !== "draw") return;

    event.preventDefault();

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {}

    drawingRef.current = true;

    const point = getPoint(event);
    filterRef.current = point;

    const erase = toolRef.current === "eraser";

    const stroke = createStroke(
      `${participantId}-${Date.now()}-${Math.random()}`,
      colorRef.current,
      erase ? ERASER_WIDTH_RATIO : PEN_WIDTH_RATIO,
      erase
    );

    activeStrokeRef.current = stroke;
    pendingRef.current = [point];

    if (erase) {
      applyEraser([point], stroke.widthRatio);
    } else {
      stroke.points.push(point);
      strokesRef.current.push(stroke);
      strokeMapRef.current.set(stroke.id, stroke);
      renderStroke(stroke);
    }

    // Send an explicit start message so recipients can associate batches.
    send({
      action: "start",
      strokeId: stroke.id,
      color: stroke.color,
      widthRatio: stroke.widthRatio,
      erase: stroke.erase,
      points: [point]
    });
  }

  function handlePointerMove(event) {
    if (
      !canDraw ||
      !drawingRef.current ||
      modeRef.current !== "draw"
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

    for (const movement of events) {
      const point = filterPoint(getPoint(movement));

      active.points.push(point);
      pendingRef.current.push(point);

      if (!active.erase) {
        // Redraw the active stroke to maintain a continuous smooth curve.
        redrawBoard();
      } else {
        // Erase locally as the finger passes over existing writing.
        applyEraser([point], active.widthRatio);
      }
    }
  }

  function handlePointerUp() {
    if (!drawingRef.current) return;

    drawingRef.current = false;

    const active = activeStrokeRef.current;

    if (active) {
      // Force the remaining batch out before ending the stroke.
      flushPoints();

      if (active.erase) {
        send({
          action: "erase",
          strokeId: active.id,
          points: active.points,
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
    }

    activeStrokeRef.current = null;
    pendingRef.current = [];
    filterRef.current = null;
  }

  useEffect(() => {
    if (!ws) {
     alert("No connection");
     return
    };

    function handleMessage(event) {

      let data;

      try {
        data = JSON.parse(event.data);
      } catch (err) {
        alert(err.message);
        return;
      }

      if (data.type !== "whiteboard") {
        return;
      }


      const canvas = canvasRef.current;
      if (!canvas) return;

      if (data.action === "clear") {
        strokesRef.current = [];
        strokeMapRef.current.clear();
        redrawBoard();
        return;
      }

      if (data.action === "erase") {
        applyEraser(
          data.points || [],
          data.widthRatio || ERASER_WIDTH_RATIO
        );
        return;
      }

      const id = data.strokeId;
      if (!id) return;

      if (data.action === "start") {
        const stroke = createStroke(
          id,
          data.color || "#111827",
          data.widthRatio || PEN_WIDTH_RATIO,
          Boolean(data.erase)
        );

        stroke.points = data.points || [];

        strokesRef.current.push(stroke);
        strokeMapRef.current.set(id, stroke);

        redrawBoard();



        return;
      }

      if (data.action === "points") {
        let stroke = strokeMapRef.current.get(id);

        if (!stroke) {
          stroke = createStroke(
            id,
            data.color || "#111827",
            data.widthRatio || PEN_WIDTH_RATIO,
            false
          );

          strokesRef.current.push(stroke);
          strokeMapRef.current.set(id, stroke);
        }

        stroke.points.push(...(data.points || []));
        redrawBoard();
        return;
      }

      if (data.action === "end") {
        // Stroke remains in history for later erasing.
        redrawBoard();
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
    redrawBoard,
    applyEraser
  ]);

  function clearBoard() {
    if (!canDraw) return;

    strokesRef.current = [];
    strokeMapRef.current.clear();

    redrawBoard();
    send({ action: "clear" });
  }

  return (
    <div className="whiteboard-app">
      <div className="whiteboard-scroll" ref={scrollRef}>
        <canvas
          ref={canvasRef}
          width={BOARD_WIDTH}
          height={INITIAL_HEIGHT}
          className="whiteboard-canvas"
          style={{
            touchAction:
              canDraw && mode === "draw" ? "none" : "pan-y"
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onLostPointerCapture={handlePointerUp}
        />
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
                    (color === item && tool === "pen"
                      ? " selected"
                      : "")
                  }
                  style={{ backgroundColor: item }}
                  onClick={() => selectColor(item)}
                />
              ))}
            </div>

            <div className="whiteboard-tools">
              <button
                type="button"
                className={tool === "pen" && mode === "draw" ? "active" : ""}
                onClick={() => updateTool("pen")}
              >
                Pen
              </button>

              <button
                type="button"
                className={tool === "eraser" && mode === "draw" ? "active" : ""}
                onClick={() => updateTool("eraser")}
              >
                Eraser
              </button>

              <button
                type="button"
                className={mode === "scroll" ? "active" : ""}
                onClick={() => updateMode(
                  modeRef.current === "scroll" ? "draw" : "scroll"
                )}
              >
                {mode === "scroll" ? "Draw" : "Scroll"}
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

