(function () {
  var zoom = window.devicePixelRatio || window.screen.deviceXDPI / window.screen.logicalXDPI;
  
  function fontSize () {
    console.log(1);
    var size;
    var winW = window.innerWidth;
    if (winW <= 1800 && winW > 800) {
      size = Math.round(winW / 18);
      if (size < 65) {
        // size = 65;
      }
    } else if (winW <= 800) {
      size = Math.round(winW / 7.5);
      if (size > 65) {
        // size = 65;
      }
    } else {
      // size = 100;
      size = winW / 1920 * 100
    }
    if (zoom == 1.25) {

      document.getElementsByTagName("html")[0].style.fontSize = size / 1.2 + "px"
    } else if (zoom == 1.5) {
      document.getElementsByTagName("html")[0].style.fontSize = size / 1.4 + "px"
    } else {
      document.getElementsByTagName("html")[0].style.fontSize = size + "px"
    }
    /* if (zoom == 1.25) {
      $('html').addClass('zoom125')
    } else if (zoom == 1.5) {
      $('html').addClass('zoom150')
    } */

  }

  fontSize();

  window.addEventListener('resize', function(event) { 
    fontSize()
  })

})();