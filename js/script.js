const inpTextTT = document.getElementById("inpTextTT");
const inpTextTR = document.getElementById("inpTextTR");
const inpTextBR = document.getElementById("inpTextBR");
const inpTextLL = document.getElementById("inpTextLL");
const outpTextTT = document.getElementsByClassName("top_left");
const outpTextTR = document.getElementsByClassName("top_right");
const outpTextBR = document.getElementsByClassName("bottom_right");
const outpTextLL = document.getElementsByClassName("bottom_left");
const outpBox = document.getElementById("outpBox");

function writeInpTT(){
    var letter = inpTextTT.value;
    for (let i = 0; i < outpTextTT.length; i++) {
        const element = outpTextTT[i];
        element.textContent = letter+"px";

    }

    outpBox.style.borderTopLeftRadius = letter+"px";

}

function writeInpTR(){
    var letter = inpTextTR.value;
    for (let i = 0; i < outpTextTR.length; i++) {
        const element = outpTextTR[i];
        element.textContent = letter+"px";

    }

    outpBox.style.borderTopRightRadius = letter+"px";

}

function writeInpBR(){
    var letter = inpTextBR.value;
    for (let i = 0; i < outpTextBR.length; i++) {
        const element = outpTextBR[i];
        element.textContent = letter+"px";

    }

    outpBox.style.borderBottomRightRadius = letter+"px";

}

function writeInpLL(){
    var letter = inpTextLL.value;
    for (let i = 0; i < outpTextLL.length; i++) {
        const element = outpTextLL[i];
        element.textContent = letter+"px";

    }

    outpBox.style.borderBottomLeftRadius = letter+"px";

}
