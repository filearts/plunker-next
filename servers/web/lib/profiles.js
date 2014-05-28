var _ = require("lodash");

exports.dropbox = function (data) {
  return {
    id: String(data.uid),
    username: data.email ? data.email.split("@")[0] : "",
    name: data.display_name || "",
    description: "",
    picture_url: {
      mini: "",
      normal: "",
      bigger: ""
    },
    company: "",
    profile_url: "",
    website_url: "",
    location: data.country || "",
    emails: _.filter([data.email])
  };
};

exports.github = function (data) {
  return {
    id: String(data.id),
    username: data.login,
    name: data.name || "",
    description: "",
    picture_url: {
      mini: "https://secure.gravatar.com/avatar/" + data.gravatar_id + "?s=24",
      normal: "https://secure.gravatar.com/avatar/" + data.gravatar_id + "?s=48",
      bigger: "https://secure.gravatar.com/avatar/" + data.gravatar_id + "?s=240"
    },
    company: data.company || "",
    profile_url: "https://github.com/" + data.login,
    website_url: data.blog || "",
    location: data.location || "",
    emails: _.filter([data.email])
  };
};

exports.google = function (data) {
  return {
    id: String(data.id),
    username: data.link.split("+").pop() || "",
    name: data.name || "",
    description: "",
    picture_url: {
      mini: data.picture + "?sz=24",
      normal: data.picture + "?sz=48",
      bigger: data.picture + "?sz=240"
    },
    company: data.company || "",
    profile_url: data.link || "",
    website_url: "",
    location: "",
    emails: _.filter([data.email])
  };
};

exports.twitter = function (data) {
  console.log("Twitter", data, {
    id: String(data.id),
    username: data.screen_name,
    name: data.name || "",
    description: data.description || "",
    picture_url: {
      mini: data.profile_image_url ? data.profile_image_url.replace("normal", "mini") : "",
      normal: data.profile_image_url || "",
      bigger: data.profile_image_url ? data.profile_image_url.replace("normal", "") : ""
    },
    company: "",
    profile_url: "https://twitter.com/" + data.screen_name,
    website_url: data.entities && data.entities.url && data.entities.url.urls && data.entities.url.urls.length ? data.entities.url.urls[0].expanded_url : "",
    location: data.location || "",
    emails: []
  });
  return {
    id: String(data.id),
    username: data.screen_name,
    name: data.name || "",
    description: data.description || "",
    picture_url: {
      mini: data.profile_image_url ? data.profile_image_url.replace("normal", "mini") : "",
      normal: data.profile_image_url || "",
      bigger: data.profile_image_url ? data.profile_image_url.replace("normal", "") : ""
    },
    company: "",
    profile_url: "https://twitter.com/" + data.screen_name,
    website_url: data.entities && data.entities.url && data.entities.url.urls && data.entities.url.urls.length ? data.entities.url.urls[0].expanded_url : "",
    location: data.location || "",
    emails: []
  };
};

/*
exports.linkedin = function (data) {
  return {
    id: String(data.id),
    username: data.screen_name,
    name: data.name || "",
    description: data.description || "",
    picture_url: {
      mini: data.profile_image_url ? data.profile_image_url.replace("normal", "mini") : "",
      normal: data.profile_image_url || "",
      bigger: data.profile_image_url ? data.profile_image_url.replace("_normal", "") : ""
    },
    company: "",
    profile_url: "https://twitter.com/" + data.screen_name,
    website_url: data.entities && data.entities.url && data.entities.url.urls && data.entities.url.urls.length ? data.entities.url.urls[0].expanded_url : "",
    location: data.location || "",
    emails: []
  };
};
*/