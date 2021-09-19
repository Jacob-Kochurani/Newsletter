"use strict";

module.exports = (server) => {
  const user = server.models.user;

  server.post("/createUser", (req, res) => {
    try {
      let userDetails = {
        firstname: req.body.firstname,
        lastname: req.body.lastname,
        email: req.body.email,
        age: req.body.age,
      };
      user.create(userDetails, (createUserError, createUserResponse) => {
        if (createUserError) throw { error: createUserError };
        if (!createUserResponse || !createUserResponse.id)
          throw { message: "Failed to create the user" };
        res.status(200).send({
          status: "success",
          data: createUserResponse,
          message: "User is created successfully",
        });
      });
    } catch (err) {
      res.status(400).send({
        status: "error",
        error: err.error || err,
        message: err.message || "Failed to create the user",
      });
    }
  });
};
