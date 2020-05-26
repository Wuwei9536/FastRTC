function draggable(el) {
  el.onmousedown = function (e) {
    let IsMousedown = true;
    let LEFT = e.clientX - parseInt(el.style.left);
    let TOP = e.clientY - parseInt(el.style.top);

    document.onmousemove = function (e) {
      if (IsMousedown) {
        el.style.left = e.clientX - LEFT + "px";
        el.style.top = e.clientY - TOP + "px";
      }
    };

    document.onmouseup = function () {
      IsMousedown = false;
    };
  };
}
