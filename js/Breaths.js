const CANVAS_FONT_SM = "12px sans-serif";
const CANVAS_FONT_LG = "16px sans-serif";
const CANVAS_FONT_XS = "bold 10px sans-serif";
const CANVASOFFSET = 50;
const LABELPOS = 20;
const VALUEPOS = 120;
const UNITPOS = 140;
const POSSTEP = 20;
const MIN_EXP = 250;
const PARABOLIC_RES = false;

let ventSettings = {
    //ventilator settings
    mode: "acvc",
    fio2: 45,
    peep: 3,
    vt: 300,
    pinsp: 10,
    // set Pinsp above PEEP in cmH2O
    ps: 5,
    //set PS above PEEP in cmH2O
    rate: 12,
    // set breath rate in bpm
    itime: 1.2,
    //total inspiratory time in sec
    pause: 15,
    // pause time in % of itime
    flow: 0,
    //flow calculated from VT and itime
    pmax: 100,
    //pmax setting in cmH2O
    breathType: "V"
};

let lung = {
    comp: 60,
    // ml/cmH2O
    res: 8,
    // cmH20/l/sec
    srate: 0,
    effort: 1,
    lungSize: 500, //will be used to calculate a sigmoid complian e curve and show overdistention
    alvPressure: 0 //monitored value but here as it is internal to patient and not accessible to ventilator
};

let monitoredValues = {
    // data from "simulated" patient
    iPressure: 0,
    //instantaneous value of pressure in cmH2O (waveform data)
    iFlow: 0,
    //instantaneous value of flow in LPM (waveform data)
    iVolume: 0,
    //instantaneous value of volume in ml (waveform data)
    breathPhase: 0,
    // 0 : expiration 1 : inspiration
    fio2: 0,
    //place holder, initially taking value form setting
    vte: 0,
    //exhaled tidal volume per breath
    vti: 0,
    //inspired tidal volume per breath
    pmax: 0,
    // peak inspiratory pressure per breath
    mve: 0,
    //exhaled minute volume
    rate: 0,
    //place holder, initially taking value form setting
    peep: 100,
    // initialize high to ensure updating during min detection
    pmean: 0,
    //mean airway pressure calculated over entire breath cycle
    peakiFlow: 0,
    pplat: -1,
    //plateau pressure calculated at end of inspiration, calculated only in VC with plateau set
    pressCumulative: 0,
    rateCumulative: 0,
    iTime: 0,
    eTime: 0
};

let time = {
    ventTime: -40,
    //running time for a whole breath
    scale: 24,
    //defines the x axis of the graph in pixels per second to give slow 24 and fast 12
    waveformTime: 0,
    // real time to be able to wrap waveforms
    tick: 10,
    //increment for each calculation and waveform plot step in milliseconds
    patientTime: 0,
    ventCountdown: 40,
    patientCountdown: 10000,
    manTrigger: false,
    windowIsOn: true,
    running: true,
    //running of frozen waveforms and ventilation
    inspTime: 0,
    expTime: 0,
    render: 0
};

/**
 * @constructor
 */

function Ventbutton(name, min, max, step, decimals) {
    "use strict";
    this.name = name;
    this.max = max;
    this.min = min;
    this.step = step;
    this.decimals = decimals;
}

let vbtn01 = new Ventbutton("fio2", 21, 100, 1, 0);
let vbtn02 = new Ventbutton("vt", 50, 1000, 10, 0);
let vbtn03 = new Ventbutton("pinsp", 1, 100, 1, 0);
let vbtn04 = new Ventbutton("rate", 3, 50, 1, 0);
let vbtn05 = new Ventbutton("itime", 0.5, 4, 0.1, 1);
let vbtn06 = new Ventbutton("pause", 0, 75, 1, 0);
let vbtn07 = new Ventbutton("ps", 0, 60, 1, 0);
let vbtn08 = new Ventbutton("peep", 0, 30, 1, 0);
let vbtn09 = new Ventbutton("pmax", 5, 100, 1, 0);

let ventButtons = [vbtn01, vbtn02, vbtn03, vbtn04, vbtn05, vbtn06, vbtn07, vbtn08, vbtn09];

/**
 * @constructor
 */
function Patientbutton(name, min, max, step, decimals) {
    "use strict";
    this.name = name;
    this.max = max;
    this.min = min;
    this.step = step;
    this.decimals = decimals;
}

let pbtn01 = new Ventbutton("comp", 2, 120, 1, 0);
let pbtn02 = new Ventbutton("res", 1, 200, 1, 0);
let pbtn03 = new Ventbutton("srate", 0, 40, 1, 0);
let pbtn04 = new Ventbutton("effort", 0, 4, 1, 0);
let pbtn05 = new Ventbutton("lungSize", 50, 600, 50, 0);

let patientButtons = [pbtn01, pbtn02, pbtn03, pbtn04, pbtn05];

let pmaxsc = [10, 20, 35, 50, 75, 100];
let pminsc = [-1, -2, -3, -4, -5, -5];
let fmaxsc = [25, 50, 100, 150, 300, 500];
let fminsc = [-25, -50, -100, -150, -300, -500];
let vmaxsc = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
let vminsc = [-2.5, -5, -10, -15, -20, -25, -30, -35, -40, -45, -50];

let sc = {
    //min and max to be used with parameter graphics scaling;
    pmax: pmaxsc[1],
    pmin: pminsc[1],
    fmax: fmaxsc[1],
    fmin: fminsc[1],
    vmax: vmaxsc[4],
    vmin: vminsc[4]
};

function canvasGetContext(canvas_id) {
    //probe canvas context for canvas operations
    "use strict";
    return document.getElementById(canvas_id).getContext("2d");
}

function scaleWaveform(value, max, min, canvHeight) {
    //calculate actual canvas coordinates from general waverom settings
    "use strict";
    let scaledValue = 0;
    scaledValue = (value - min) * canvHeight / (max - min);
    return Math.round(scaledValue);
}

function renderParamText(param, label, unit, ctxCanvas, position) {
    //monitored parameter printing with correct alignment
    "use strict";
    ctxCanvas.font = CANVAS_FONT_LG;
    ctxCanvas.fillText(label, LABELPOS, position * POSSTEP + 15);
    ctxCanvas.fillText(param, VALUEPOS - ctxCanvas.measureText(param).width, position * POSSTEP + 15);
    ctxCanvas.font = CANVAS_FONT_SM;
    ctxCanvas.fillText(unit, UNITPOS, position * POSSTEP + 15);
}

function drawAxis(ctx, canvasOffset, max, min, label, units) {
    //drawing waveform canvas grid and axes
    "use strict";
    let i = 0.2;

    if (ctx.canvas.id === "canvMarkers_bg") {
        ctx.font = CANVAS_FONT_SM;
        ctx.fillStyle = "Gray";
        ctx.fillText(label, canvasOffset - 5 - ctx.measureText(label).width, 12);
        return 1;
    }

    ctx.font = CANVAS_FONT_SM;
    ctx.fillStyle = "Gray";
    ctx.fillText(label, canvasOffset + 5, 15);
    ctx.fillText(units, ctx.canvas.width - 5 - ctx.measureText(units).width, 15);

    ctx.beginPath();
    ctx.strokeStyle = "Gray";
    ctx.lineWidth = 1;
    ctx.moveTo(canvasOffset, 1);
    ctx.lineTo(ctx.canvas.width - 1, 1);
    ctx.lineTo(ctx.canvas.width - 1, ctx.canvas.height - 1);
    ctx.lineTo(canvasOffset, ctx.canvas.height - 1);
    ctx.lineTo(canvasOffset, 1);
    ctx.stroke();

    for (i = 0.1; i <= 0.9; i = i + 0.1) {

        ctx.beginPath();
        ctx.moveTo(canvasOffset + (ctx.canvas.width - canvasOffset) * i, 1);
        ctx.lineTo(canvasOffset + (ctx.canvas.width - canvasOffset) * i, ctx.canvas.height - 1);
        ctx.stroke();

    }
    ctx.strokeStyle = "White";
    ctx.beginPath();

    ctx.moveTo(canvasOffset, ctx.canvas.height - scaleWaveform(0, max, min, ctx.canvas.height));
    ctx.lineTo(ctx.canvas.width, ctx.canvas.height - scaleWaveform(0, max, min, ctx.canvas.height));
    ctx.stroke();

    ctx.fillText(0, canvasOffset - 5 - ctx.measureText(0).width, ctx.canvas.height - scaleWaveform(0, max, min, ctx.canvas.height));

    ctx.strokeStyle = "Gray";

    if (max + min === 0) {
        // for Flow needs to go both positive and negative
        for (i = -((max - min) / 4); i <= max; i = i + (max - min) / 4) {
            ctx.beginPath();
            ctx.moveTo(canvasOffset, ctx.canvas.height - scaleWaveform(i, max, min, ctx.canvas.height));
            ctx.lineTo(ctx.canvas.width, ctx.canvas.height - scaleWaveform(i, max, min, ctx.canvas.height));
            ctx.stroke();
            ctx.fillText(i, canvasOffset - 5 - ctx.measureText(i).width, ctx.canvas.height - scaleWaveform(i, max, min, ctx.canvas.height));
        }
    } else {
        for (i = max / 5; i <= max; i = i + max / 5) {
            ctx.beginPath();
            ctx.moveTo(canvasOffset, ctx.canvas.height - scaleWaveform(i, max, min, ctx.canvas.height));
            ctx.lineTo(ctx.canvas.width, ctx.canvas.height - scaleWaveform(i, max, min, ctx.canvas.height));
            ctx.stroke();
            ctx.fillText(i, canvasOffset - 5 - ctx.measureText(i).width, ctx.canvas.height - scaleWaveform(i, max, min, ctx.canvas.height));
        }
    }
}

function updateNumerics() {
    // display breath by breath monitored values
    "use strict";
    monitoredValues.fio2 = ventSettings.fio2 + ((Math.random() - 0.5) * 2); //adds a random + 2% to FiO2 setting as a monitored value

    monitoredValues.rate = 60000 / (monitoredValues.iTime + monitoredValues.eTime);

    let ctxN = canvasGetContext("canvPnumerics_fg");
    ctxN.clearRect(0, 0, ctxN.canvas.width, ctxN.canvas.height);
    ctxN.fillStyle = "#FFFFFF";
    renderParamText(monitoredValues.pmax.toFixed(0), "Pmax", "cmH2O", ctxN, 0);
    if (monitoredValues.pplat > 0) {
        renderParamText(monitoredValues.pplat.toFixed(0), "Pplat", "cmH2O", ctxN, 1);
    } else {
        renderParamText("---", "Pplat", "cmH2O", ctxN, 1);
    }
    renderParamText(monitoredValues.peep.toFixed(0), "PEEP", "cmH2O", ctxN, 2);
    renderParamText(monitoredValues.pmean.toFixed(0), "Pmean", "cmH2O", ctxN, 3);

    ctxN = canvasGetContext("canvFnumerics_fg");
    ctxN.clearRect(0, 0, ctxN.canvas.width, ctxN.canvas.height);
    ctxN.fillStyle = "#FFFFFF";
    renderParamText(monitoredValues.rate.toFixed(0), "Rate", "/min", ctxN, 0);
    renderParamText("1:" + (1 / (monitoredValues.iTime / monitoredValues.eTime)).toFixed(1), "I:E", "", ctxN, 1);
    renderParamText(monitoredValues.fio2.toFixed(0), "FiO2", "%", ctxN, 2);
    renderParamText(monitoredValues.vte.toFixed(0), "Vte", "ml", ctxN, 3);
    renderParamText(monitoredValues.mve.toFixed(1), "Mve", "l/min", ctxN, 4);

    monitoredValues.vte = 0;
    monitoredValues.peep = 100;
    monitoredValues.pmax = 0;
    monitoredValues.peep = 100;
    monitoredValues.pmean = 0;
}

function isInArray(value, array) {
    //logical testing for arays
    "use strict";
    return array.indexOf(value) > -1;
}

function resistiveFlow(pressure) {
    if (PARABOLIC_RES) {
        if (pressure <= 0) {
            return 0;
        } else {
            return Math.sqrt(pressure / (lung.res / 1000));
        }
    } else {
        return (pressure) / (lung.res) * 60;
    }
}

function resistivePressure(flow) {
    if (PARABOLIC_RES) {
        return Math.pow(flow, 2) * lung.res / 1000;
    } else {
        return flow * lung.res / 60;
    }
}


function compliance(pressure){
    "use strict"
    let compliance = 0;
    if (pressure <= 5) compliance = lung.comp * (pressure/5);
    if (pressure >5 & pressure <= 30) compliance = lung.comp;
    if (pressure > 30) compliance = lung.comp * 0.6;
    return (lung.comp);
    //return (compliance);
}

function updateRTN() {
    // display real time monitored values for debugging purposes
    "use strict";

    let ctxN = canvasGetContext("canvVnumerics_fg");
    ctxN.clearRect(0, 0, ctxN.canvas.width, ctxN.canvas.height);
    ctxN.fillStyle = "#888888";

    renderParamText(monitoredValues.iPressure.toFixed(1), "Paw", "cmH2O", ctxN, 0);
    renderParamText(lung.alvPressure.toFixed(1), "Palv", "cmH2O", ctxN, 1);
    renderParamText(monitoredValues.iFlow.toFixed(0), "Flow", "l/min", ctxN, 2);
    renderParamText(monitoredValues.iVolume.toFixed(0), "Vol", "ml", ctxN, 3);
    renderParamText(time.windowIsOn, "Trig. win.", "", ctxN, 4);

    // renderParamText(time.inspTime.toFixed(0), "Itime", "msec", ctxN, 0);
    // renderParamText(time.expTime.toFixed(0), "Etime", "msec", ctxN, 1);
    // renderParamText(time.waveformTime.toFixed(0), "Wave", "msec", ctxN, 2);
    // renderParamText(time.windowIsOn, "Win", "", ctxN, 3);
    // renderParamText(monitoredValues.eTime.toFixed(0), "E", "msec", ctxN, 4);

    if (monitoredValues.breathPhase === 1) {
        renderParamText("insp", "Phase", "", ctxN, 5);
    } else {
        renderParamText("exp", "Phase", "", ctxN, 5);
    }
}

function drawBreathMark(txt, ctx, x, y, color) {
    //mark and qualify breath triggers
    "use strict";

    ctx.font = CANVAS_FONT_XS;
    ctx.fillStyle = color;
    ctx.strokeStyle = color;

    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 1, 0);
    ctx.lineTo(x - 1, ctx.canvas.height - 8);
    ctx.stroke();

    ctx.fillText(txt, x - 5 - ctx.measureText(txt).width, y);
}

function volToFlow(vt, itime, pausetime) {
    //used to convent iTime to flow for volume breaths
    "use strict";
    return vt / (((itime * 1000 - itime * 1000 * pausetime / 100) / 1000) * 16.667);
}

function initializeCanvas() {
    "use strict";
    let ctxP = canvasGetContext("canvPressure_fg");
    let ctxF = canvasGetContext("canvFlow_fg");
    let ctxV = canvasGetContext("canvVolume_fg");
    let ctxPa = canvasGetContext("canvAlvPressure_fg");
    let ctxM = canvasGetContext("canvMarkers_fg");

    let ctxPb = canvasGetContext("canvPressure_bg");
    let ctxFb = canvasGetContext("canvFlow_bg");
    let ctxVb = canvasGetContext("canvVolume_bg");
    let ctxMb = canvasGetContext("canvMarkers_bg");

    ctxP.clearRect(0, 0, ctxP.canvas.width, ctxP.canvas.height);
    ctxF.clearRect(0, 0, ctxF.canvas.width, ctxF.canvas.height);
    ctxV.clearRect(0, 0, ctxV.canvas.width, ctxV.canvas.height);
    ctxPa.clearRect(0, 0, ctxPa.canvas.width, ctxPa.canvas.height);
    ctxM.clearRect(0, 0, ctxM.canvas.width, ctxM.canvas.height);

    ctxPb.clearRect(0, 0, ctxPb.canvas.width, ctxPb.canvas.height);
    ctxFb.clearRect(0, 0, ctxFb.canvas.width, ctxFb.canvas.height);
    ctxVb.clearRect(0, 0, ctxVb.canvas.width, ctxVb.canvas.height);
    ctxMb.clearRect(0, 0, ctxMb.canvas.width, ctxMb.canvas.height);

    drawAxis(ctxPb, CANVASOFFSET, sc.pmax, sc.pmin, "Paw", "cmH20");
    drawAxis(ctxFb, CANVASOFFSET, sc.fmax, sc.fmin, "Flow", "l/min");
    drawAxis(ctxVb, CANVASOFFSET, sc.vmax, sc.vmin, "Vol", "ml");
    drawAxis(ctxMb, CANVASOFFSET, 0, 0, ">>>", "");

    ctxP.beginPath();
    ctxP.strokeStyle = "Yellow";
    ctxP.lineWidth = 2;
    // ctxP.lineCap = "Round";
    ctxP.moveTo(0, ctxP.canvas.height - scaleWaveform(ventSettings.peep, sc.pmax, sc.pmin, ctxP.canvas.height));

    ctxPa.beginPath();
    ctxPa.strokeStyle = "Gray";
    ctxPa.lineWidth = 2;
    // ctxP.lineCap = "Round";
    ctxPa.moveTo(0, ctxPa.canvas.height - scaleWaveform(ventSettings.peep, sc.pmax, sc.pmin, ctxP.canvas.height));

    ctxF.beginPath();
    ctxF.strokeStyle = "LightGreen";
    ctxF.lineWidth = 2;
    ctxF.moveTo(0, ctxF.canvas.height - scaleWaveform(0, sc.fmax, sc.fmin, ctxF.canvas.height));
    ctxF.beginPath();

    ctxV.strokeStyle = "White";
    ctxV.lineWidth = 2;
    ctxV.moveTo(0, ctxV.canvas.height - scaleWaveform(0, sc.vmax, sc.vmin, ctxV.canvas.height));
    ctxF.beginPath();
    if (isInArray(ventSettings.mode, ["acvc", "simvvc])) {
        ventSettings.flow = volToFlow(ventSettings.vt, ventSettings.itime, ventSettings.pause);
    }
}

function drawWave(ctx, x, y) {
    //generalized waveform drawing
    "use strict";
    ctx.clearRect(x - 1, 0, 30, 150);

    x = Math.round(x);
    y = Math.round(y);

    if (x <= ctx.canvas.width) {
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.closePath();
    }
    if (x >= ctx.canvas.width) {
        ctx.beginPath();
        ctx.moveTo(-1, y);
    } else {
        ctx.beginPath();
        ctx.moveTo(x, y);
    }
}

function startVentilation() {
    //starts the ventilation simulation process, 
    "use strict";

    let ctxP = canvasGetContext("canvPressure_fg");
    let ctxF = canvasGetContext("canvFlow_fg");
    let ctxV = canvasGetContext("canvVolume_fg");
    let ctxPa = canvasGetContext("canvAlvPressure_fg");
    let ctxM = canvasGetContext("canvMarkers_fg");

    //Initialize ventilator parameters
    if (isInArray(ventSettings.mode, ["acvc", "simvvc"])) {
        //initialize VC flow from set vt, itime and pause
        ventSettings.flow = volToFlow(ventSettings.vt, ventSettings.itime, ventSettings.pause);
    }

    lung.alvPressure = ventSettings.peep;
    monitoredValues.rate = ventSettings.rate;
    ventilate(ctxP, ctxPa, ctxF, ctxV, ctxM);
}

function ventilate(ctxP, ctxPa, ctxF, ctxV, ctxM) {
    //starts timing interval
    "use strict";
    setInterval(function () {
        ventControl(ctxP, ctxPa, ctxF, ctxV, ctxM);
    }, time.tick);
}

function ventControl(ctxP, ctxPa, ctxF, ctxV, ctxM) {
    // all timing decisions are in aggregated in this function
    "use strict";
    let spontBreathInterval = 60 / lung.srate * 1000;

    if (time.running === false) {
        return 1;
    }

    time.ventTime += time.tick;
    //time.waveformTime += time.tick;
    time.patientTime += time.tick;
    time.render += 1;

    time.ventCountdown -= time.tick;
    time.patientCountdown -= time.tick;

    if (isInArray(ventSettings.mode, ["simvvc", "simvpc"]) && time.ventCountdown <= 0) {
        if (!time.windowIsOn) {
            time.ventCountdown = 60 / ventSettings.rate * 1000;
        }
        time.windowIsOn = true;

    }

    if (isInArray(ventSettings.mode, ["acvc", "acpc"])) {
        //mandatory at set rate
        if (time.ventCountdown <= 0) {
            if (monitoredValues.breathPhase === 0) {
                // display monitored values at end of inspiration
                monitoredValues.pmean = monitoredValues.pmean / (monitoredValues.iTime + time.expTime) * time.tick;
                monitoredValues.eTime = time.ventTime - monitoredValues.iTime;
                time.ventTime = time.tick;
                time.ventCountdown = 60 / ventSettings.rate * 1000;
                time.patientCountdown = 60 / lung.srate * 1000;
                //drawBreathMark("mand", ctxM, time.waveformTime / time.scale, 10, "white");
                updateNumerics();
            }
            monitoredValues.breathPhase = 1;
        }
    }

    if (isInArray(ventSettings.mode, ["acvc", "acpc"])) {
        //triggered
        if ((time.patientCountdown <= 0 || time.manTrigger)) {
            //start inspiration at 1/rate interval and calculate all by breath values
            if (monitoredValues.breathPhase === 0) {
                // display monitored values at end of inspiration
                monitoredValues.pmean = monitoredValues.pmean / (monitoredValues.iTime + time.expTime) * time.tick;
                monitoredValues.eTime = time.ventTime - monitoredValues.iTime;
                time.manTrigger = false;
                time.ventTime = time.tick;
                time.patientTime = 0;
                time.ventCountdown = 60 / ventSettings.rate * 1000;
                time.patientCountdown = 60 / lung.srate * 1000;
                drawBreathMark("asst", ctxM, time.waveformTime / time.scale, 10, "red");
                updateNumerics();
            }
            monitoredValues.breathPhase = 1;
        }
    }

    if (isInArray(ventSettings.mode, ["cpapps"])) {

        if ((time.patientCountdown <= 0) || time.manTrigger) {

            if (monitoredValues.breathPhase === 0) {
                monitoredValues.eTime = time.ventTime - monitoredValues.iTime;
                monitoredValues.pmean = monitoredValues.pmean / (monitoredValues.iTime + time.expTime) * time.tick;
                time.ventTime = time.tick; //restart vent time
                time.manTrigger = false;
                time.patientTime = 0;
                time.patientCountdown = 60 / lung.srate * 1000;
                updateNumerics();
                drawBreathMark("supp", ctxM, time.waveformTime / time.scale, 10, "yellow");
                ventSettings.breathType = "PS"

            }
            //lung.alvPressure -= lung.effort * 3;
            monitoredValues.breathPhase = 1;
        }

    }

    if (isInArray(ventSettings.mode, ["simvvc", "simvpc"])) {
        //mandatory at set rate
        if (time.ventCountdown <= 0) {
            if (monitoredValues.breathPhase === 0) {
                // display monitored values at end of inspiration
                monitoredValues.pmean = monitoredValues.pmean / (monitoredValues.iTime + time.expTime) * time.tick;
                monitoredValues.eTime = time.ventTime - monitoredValues.iTime;
                time.ventTime = time.tick;
                time.ventCountdown = 60 / ventSettings.rate * 1000;
                time.patientCountdown = 60 / lung.srate * 1000;
                //drawBreathMark("mand", ctxM, time.waveformTime / time.scale, 10, "white");
                updateNumerics();
                if (isInArray(ventSettings.mode, ["acvc", "simvvc"])) {
                    ventSettings.breathType = "V"
                }
                if (isInArray(ventSettings.mode, ["acpc", "simvpc"])) {
                    ventSettings.breathType = "P"
                }
            }
            monitoredValues.breathPhase = 1;
        }

    }

    if (isInArray(ventSettings.mode, ["simvvc", "simvpc"])) {
        //triggered, window on
        if (((time.patientCountdown <= 0 || time.manTrigger)) && time.windowIsOn) {
            if (monitoredValues.breathPhase === 0) {
                // display monitored values at end of inspiration
                monitoredValues.pmean = monitoredValues.pmean / (monitoredValues.iTime + time.expTime) * time.tick;
                monitoredValues.eTime = time.ventTime - monitoredValues.iTime;
                time.manTrigger = false;
                time.ventTime = time.tick;
                time.patientTime = 0;
                time.patientCountdown = 60 / lung.srate * 1000;
                time.windowIsOn = false;
                drawBreathMark("asst", ctxM, time.waveformTime / time.scale, 10, "red");
                updateNumerics();
                if (isInArray(ventSettings.mode, ["acvc", "simvvc"])) {
                    ventSettings.breathType = "V"
                }
                if (isInArray(ventSettings.mode, ["acpc", "simvpc"])) {
                    ventSettings.breathType = "P"
                }
            }
            monitoredValues.breathPhase = 1;
        }

    }

    if (isInArray(ventSettings.mode, ["simvvc", "simvpc"])) {
        // triggered window off

        if (((time.patientCountdown <= 0 || time.manTrigger)) && !time.windowIsOn) {
            if (monitoredValues.breathPhase === 0) {
                monitoredValues.pmean = monitoredValues.pmean / (monitoredValues.iTime + time.expTime) * time.tick;
                monitoredValues.eTime = time.ventTime - monitoredValues.iTime;
                time.ventTime = time.tick; //restart vent time
                time.manTrigger = false;
                time.patientTime = 0;
                time.patientCountdown = 60 / lung.srate * 1000;
                updateNumerics();
                drawBreathMark("supp", ctxM, time.waveformTime / time.scale, 10, "yellow");
                ventSettings.breathType = "PS"
                lung.alvPressure -= lung.effort * 3;
            }
            monitoredValues.breathPhase = 1;
        }

    }

    if (monitoredValues.breathPhase === 1) {
        time.inspTime += time.tick;
        renderInspiration(ventSettings.breathType);
    } else {
        time.expTime += time.tick;
        renderExpiration();
    }

    //draw waves and update numerics every 4 time ticks
    if (time.render === 4) {
        time.waveformTime += 4 * time.tick;

        drawWave(ctxP, time.waveformTime / time.scale, ctxP.canvas.height - scaleWaveform(monitoredValues.iPressure, sc.pmax, sc.pmin, ctxP.canvas.height));
        if ($("#showAlv").is(":checked")) {
            ctxPa.strokeStyle = "rgba(128,128,128,1)"; //set alv draw color transparency to 1
        } else {
            ctxPa.strokeStyle = "rgba(128,128,128,0)"; //set alv draw color transparency to 0
        }
        drawWave(ctxPa, time.waveformTime / time.scale, ctxP.canvas.height - scaleWaveform(lung.alvPressure, sc.pmax, sc.pmin, ctxP.canvas.height));
        drawWave(ctxF, time.waveformTime / time.scale, ctxF.canvas.height - scaleWaveform(monitoredValues.iFlow, sc.fmax, sc.fmin, ctxF.canvas.height));
        drawWave(ctxV, time.waveformTime / time.scale, ctxV.canvas.height - scaleWaveform(monitoredValues.iVolume, sc.vmax, sc.vmin, ctxV.canvas.height));
        ctxM.clearRect(time.waveformTime / time.scale - 1, 0, 30, 12);
        time.render = 0;

        updateRTN(); //render real time values for debugging purposes at every time tick
        if (time.waveformTime / time.scale >= ctxP.canvas.width) {
            //wrap graph at end of canvas
            time.waveformTime = -1;
        }

    }

    return 0;
}

// 

// equation of motion P = PEEP + Flow x Res + Vol/Comp  or Flow = (P - PEEP - Vol/Comp)/Res

function renderInspiration(breathType) {
    // rendering of the equation of motion for inspiration
    "use strict";
    let jitteryPEEP = ventSettings.peep; //+ ((Math.random() - 0.5) * 0.1);
    let jitteryFlow = ventSettings.flow * (1 - 10 / time.ventTime); //+ ((Math.random() - 0.5) * 1);
    time.expTime = 0;

    if (breathType === "V") {
        //Volume inspiration
        if (time.inspTime <= (ventSettings.itime * 1000 - ventSettings.itime * 1000 * ventSettings.pause / 100)) {
            monitoredValues.iPressure = jitteryPEEP + resistivePressure(ventSettings.flow) + (monitoredValues.iVolume / compliance(lung.alvPressure));
            monitoredValues.iVolume += jitteryFlow * time.tick * 0.0166667;
            monitoredValues.iFlow = jitteryFlow;
            lung.alvPressure = jitteryPEEP + monitoredValues.iVolume / compliance(lung.alvPressure);
        } else {
            monitoredValues.iPressure = lung.alvPressure - ventSettings.peep + jitteryPEEP; //adding jitter
            monitoredValues.iFlow = 0;
        }
        if (monitoredValues.iPressure >= monitoredValues.pmax) {
            //record the max value of iPressure
            monitoredValues.pmax = monitoredValues.iPressure;
        }
        if (ventSettings.pause > 0) {
            //update pplat (-1 indicates that display should be dashed)
            monitoredValues.pplat = lung.alvPressure;
        } else {
            monitoredValues.pplat = -1;
        }
        // end of inspiration decision
        if (time.inspTime >= ventSettings.itime * 1000) {
            monitoredValues.iTime = time.inspTime;
            monitoredValues.breathPhase = 0;
        }
    }

    if (breathType === "P") {
        //Pressure inspiration
        monitoredValues.iFlow = resistiveFlow(ventSettings.pinsp + jitteryPEEP - lung.alvPressure);
        //monitoredValues.iFlow = (ventSettings.pinsp - jitteryPEEP - monitoredValues.iVolume/lung.comp)/lung.res*60;
        monitoredValues.iVolume += monitoredValues.iFlow * time.tick * 0.0166667;
        lung.alvPressure = jitteryPEEP + monitoredValues.iVolume / compliance(lung.alvPressure);
        monitoredValues.iPressure = ventSettings.pinsp * (1 - 10 / time.ventTime) + jitteryPEEP; // multiplier to produce smooth ascent
        if (monitoredValues.iPressure >= monitoredValues.pmax) {
            //record the max value of iPressure during inspiration
            monitoredValues.pmax = monitoredValues.iPressure;
        }
        monitoredValues.pplat = -1;
        // end of inspiration decision
        if (time.inspTime >= ventSettings.itime * 1000) {
            monitoredValues.iTime = time.inspTime;
            monitoredValues.breathPhase = 0;
        }

    }

    if (breathType === "PS") {
        //Pressure Support inspiration
        monitoredValues.iFlow = resistiveFlow(ventSettings.ps + jitteryPEEP - lung.alvPressure);
        monitoredValues.iVolume += monitoredValues.iFlow * time.tick * 0.0166667;
        lung.alvPressure = jitteryPEEP + monitoredValues.iVolume / compliance(lung.alvPressure);
        lung.alvPressure -= lung.effort / 2 * (1 - 11 / time.ventTime);
        monitoredValues.iPressure = ventSettings.ps * (1 - 11 / time.ventTime) + jitteryPEEP; // multiplier to produce smooth ascent
        if (monitoredValues.iPressure >= monitoredValues.pmax) {
            //record the max value of iPressure during inspiration
            monitoredValues.pmax = monitoredValues.iPressure;
        }
        if (monitoredValues.iFlow >= monitoredValues.peakiFlow) {
            //record the max value of iFlow during inspiration
            monitoredValues.peakiFlow = monitoredValues.iFlow;
        }
        monitoredValues.pplat = -1;
        // end of inspiration decision
        if (monitoredValues.iFlow <= monitoredValues.peakiFlow * 0.25) {
            monitoredValues.iTime = time.inspTime;
            monitoredValues.breathPhase = 0;
        }
    }

    if (breathType === "SP") {
        //Spontaneous inspiration
        monitoredValues.iFlow = resistiveFlow(ventSettings.pinsp + jitteryPEEP - lung.alvPressure);
        monitoredValues.iVolume += monitoredValues.iFlow * time.tick * 0.0166667;
        lung.alvPressure = jitteryPEEP + monitoredValues.iVolume / compliance(lung.alvPressure);
        monitoredValues.iPressure = (1 + jitteryPEEP) * (1 - 10 / time.ventTime); // multiplier to produce smooth ascent
        if (monitoredValues.iPressure >= monitoredValues.pmax) {
            //record the max value of iPressure during inspiration
            monitoredValues.pmax = monitoredValues.iPressure;
        }
        if (monitoredValues.iFlow >= monitoredValues.peakiFlow) {
            //record the max value of iFlow during inspiration
            monitoredValues.peakiFlow = monitoredValues.iFlow;
        }
        monitoredValues.pplat = -1;
        // end of inspiration decision
        if (monitoredValues.iFlow <= monitoredValues.peakiFlow * 0.25) {
            monitoredValues.iTime = time.ventTime;
            monitoredValues.breathPhase = 0;
        }
    }

    monitoredValues.pmean += monitoredValues.iPressure; //accumulate pressure values
    return 1;
}

function renderExpiration() {
    // rendering of the exponential decay during expiration
    "use strict";
    time.inspTime = 0;
    monitoredValues.peakiFlow = 0; //zero peak i flow holder at the start of expiration

    let jitteryPEEP = ventSettings.peep //+ ((Math.random() - 0.5) * 0.1);
    let jitteryFlow = ventSettings.flow //+ ((Math.random() - 0.5) * 1);
    monitoredValues.iFlow = -resistiveFlow(lung.alvPressure - jitteryPEEP);
    monitoredValues.iVolume += monitoredValues.iFlow * time.tick * 0.0166667;
    monitoredValues.iPressure = jitteryPEEP;
    lung.alvPressure = jitteryPEEP + monitoredValues.iVolume / compliance(lung.alvPressure);
    //update monitored values
    if (monitoredValues.iVolume >= monitoredValues.vte) {
        //record the max value of iVolume, simulator has no leaks for Vti and Vte are the same
        monitoredValues.vte = monitoredValues.iVolume;
        monitoredValues.vti = monitoredValues.vte * 1.05;
    }
    if (monitoredValues.iPressure <= monitoredValues.peep) {
        //record the minimum value of iPressure as PEEP
        monitoredValues.peep = monitoredValues.iPressure;
    }
    monitoredValues.mve = monitoredValues.vte * monitoredValues.rate / 1000;

    monitoredValues.pmean += monitoredValues.iPressure; //accumulate pressure values
}

// previously in index.html

function setLung(param) {
    //event triggered when a patient lung respiratory setting is updated in GUI
    "use strict";
    let x = 0;
    let localText = "";
    localText = "input[name='" + param + "']";
    x = $(localText).prop("value");
    lung[param] = parseInt(x);
    time.patientCountdown = 60 / lung.srate * 1000;
}

function setVent(param) {
    //event triggered when a vent setting is updated in GUI
    "use strict";
    let x = 0;
    let localText = "";
    x = document.getElementById(param).value;
    ventSettings[param] = parseFloat(x);

    if (isInArray(param, ["vt", "itime", "pause"]) && isInArray(ventSettings.mode, ["acvc", "simvvc"])) {
        ventSettings.flow = volToFlow(ventSettings.vt, ventSettings.itime, ventSettings.pause);

    }
}

function initializeSettings() {
    //add initial values and labesl to setting inputs
    "use strict";
    let i = 0;
    let localText = "";

    for (i in patientButtons) {
        //intialize ventilator settings butons
        localText = "input[name='" + patientButtons[i].name + "']";
        $(localText).TouchSpin({
            min: patientButtons[i].min,
            max: patientButtons[i].max,
            step: patientButtons[i].step,
            decimals: patientButtons[i].decimals,
            initval: lung[name = patientButtons[i].name]
        });
    }
    for (i in ventButtons) {
        //intialize patient simulator buttons
        localText = "input[name='" + ventButtons[i].name + "']";
        $(localText).TouchSpin({
            min: ventButtons[i].min,
            max: ventButtons[i].max,
            step: ventButtons[i].step,
            decimals: ventButtons[i].decimals,
            initval: ventSettings[name = ventButtons[i].name]
        });
    }

}

function freezeDisplay() {
    //pause simulation
    "use strict";
    $("#freezeDisp.fa").toggleClass("fa-pause fa-play");

    if (time.running === true) {
        $("#freezeDispTxt").text("Unfreeze waveforms");

        time.running = false;
    } else {
        $("#freezeDispTxt").text("Freeze waveforms");
        time.running = true;
    }
}

function setMode() {
    //event triggered when a vent mode is changed. Handles also active vs inactive settings
    "use strict";
    console.log(document.getElementById("mode-selector").value);
    ventSettings.mode = document.getElementById("mode-selector").value;
    if (isInArray(ventSettings.mode, ["acvc", "simvvc"])) {
        ventSettings.flow = volToFlow(ventSettings.vt, ventSettings.itime, ventSettings.pause);
    }

    switch (ventSettings.mode) {
    case "acvc":
        $("#vt").removeAttr("disabled");
        $("#rate").removeAttr("disabled");
        $("#pinsp").attr("disabled", "true");
        $("#pause").removeAttr("disabled");
        $("#ps").attr("disabled", "true");
        $("#itime").removeAttr("disabled");
        ventSettings.breathType = "V";
        break;
    case "acpc":
        $("#vt").attr("disabled", "true");
        $("#rate").removeAttr("disabled");
        $("#pinsp").removeAttr("disabled");
        $("#pause").attr("disabled", "true");
        $("#ps").attr("disabled", "true");
        $("#itime").removeAttr("disabled");
        ventSettings.breathType = "P";
        break;
    case "simvvc":
        $("#vt").removeAttr("disabled");
        $("#rate").removeAttr("disabled");
        $("#pinsp").attr("disabled", "true");
        $("#pause").removeAttr("disabled");
        $("#ps").removeAttr("disabled");
        $("#itime").removeAttr("disabled");
        ventSettings.breathType = "V";
        break;
    case "simvpc":
        $("#vt").attr("disabled", "true");
        $("#rate").removeAttr("disabled");
        $("#pinsp").removeAttr("disabled");
        $("#pause").attr("disabled", "true");
        $("#ps").removeAttr("disabled");
        $("#itime").removeAttr("disabled");
        ventSettings.breathType = "P";
        break;
    case "cpapps":
        $("#vt").attr("disabled", "true");
        $("#rate").attr("disabled", "true");
        $("#pinsp").attr("disabled", "true");
        $("#pause").attr("disabled", "true");
        $("#ps").removeAttr("disabled");
        $("#itime").attr("disabled", "true");
        ventSettings.breathType = "PS";
        break;

    }

}

function triggerBreath() {
    //event triggered when user presses effort buttons
    "use strict";
    if (monitoredValues.breathPhase === 0) {
        time.manTrigger = true;
        lung.alvPressure -= lung.effort * 3;
    }
}

function setZoom(param, inout) {
    //zoom in or out waveform canvases
    "use strict";

    let currIndexSc = 0;

    function CurrentScale(currScale) {
        switch (param) {
        case "p":
            return currScale === sc.pmax;
        case "f":
            return currScale === sc.fmax;
        case "v":
            return currScale === sc.vmax;
        }
    }
    switch (param) {
    case "p":
        currIndexSc = pmaxsc.findIndex(CurrentScale);

        if (inout === "-") {
            if (currIndexSc === pmaxsc.length - 1) {
                break;
            }
            sc.pmax = pmaxsc[currIndexSc + 1];
            sc.pmin = pminsc[currIndexSc + 1];
        }

        if (inout === "+") {
            if (currIndexSc === 0) {
                break;
            }
            sc.pmax = pmaxsc[currIndexSc - 1];
            sc.pmin = pminsc[currIndexSc - 1];
        }
        break;
    case "f":
        currIndexSc = fmaxsc.findIndex(CurrentScale);

        if (inout === "-") {
            if (currIndexSc === fmaxsc.length - 1) {
                break;
            }
            sc.fmax = fmaxsc[currIndexSc + 1];
            sc.fmin = fminsc[currIndexSc + 1];
        }

        if (inout === "+") {
            if (currIndexSc === 0) {
                break;
            }
            sc.fmax = fmaxsc[currIndexSc - 1];
            sc.fmin = fminsc[currIndexSc - 1];
        }
        break;
    case "v":
        currIndexSc = vmaxsc.findIndex(CurrentScale);

        if (inout === "-") {
            if (currIndexSc === vmaxsc.length - 1) {
                break;
            }
            sc.vmax = vmaxsc[currIndexSc + 1];
            sc.vmin = vminsc[currIndexSc + 1];
        }

        if (inout === "+") {
            if (currIndexSc === 0) {
                break;
            }
            sc.vmax = vmaxsc[currIndexSc - 1];
            sc.vmin = vminsc[currIndexSc - 1];
        }
        break;
    }
    time.waveformTime = 0;
    initializeCanvas();
}

function infoModal() {
    $('#infoModal').modal();
}
