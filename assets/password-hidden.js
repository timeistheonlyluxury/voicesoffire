function getQueryVariable(variable) {
  var query = window.location.search.substring(1);
  var vars = query.split("&");
  for (var i = 0; i < vars.length; i++) {
    var pair = vars[i].split("=");
    if (pair[0] == variable) {
      return pair[1];
    }
  }
  return false;
}

if (
  getQueryVariable("password") === "true" ||
  getQueryVariable("pw") === "true" ||
  getQueryVariable("pwpassword") === "true"
) {
  var elem = document.querySelector("#password-container");
  elem.classList.add("password-show");
}
