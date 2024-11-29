const { updateCalls } = require("./calls");
const { recover } = require("./compositions");
const servicesController = require("./services");
const models = require("../models/models"); // Путь к модели

const updateAll = async (req, res) => {
    try {
        await updateCalls();
        await servicesController.updateServices();
        await recover();
        res.status(200).send("Updated successfully");
    } catch (error) {
        console.error("Error updating data:", error);
        res.status(500).send("Internal Server Error");
    }
};

const updateStatics = async (req, res) => {
    console.log("get update");
    try {
        const tasks = await models.Call.findAll();
        const s = await models.Service.findAll();
        const u = await models.User.findAll();
        console.log("s", s.length);
        console.log("u", u.length);
        const userService = {};
        for (let i = 0; i < u.length; i++) {
            for (let j = 0; j < s.length; j++) {
                console.log("i", i, u[i].getDataValue("id"));
                console.log("j", j, s[j].getDataValue("id"));

                if (userService[u[i].getDataValue("id")]) {
                    userService[u[i].getDataValue("id")] = {
                        ...userService[u[i].getDataValue("id")],
                        [s[j].getDataValue("id")]: 0,
                    };
                } else {
                    userService[u[i].getDataValue("id")] = {
                        [s[j].getDataValue("id")]: 0,
                    };
                }
            }
        }
        console.log("userService", userService);
        for (let i = 0; i < tasks.length; i++) {
            let task = tasks[i];
            if (userService[task.owner] && userService[task.owner][task.mid]) {
                userService[task.owner][task.mid] += 1;
                continue;
            }
            if (userService[task.owner]) {
                userService[task.owner][task.mid] = 1;
                continue;
            }

            userService[task.owner] = { [task.mid]: 1 };
        }
        console.log("userService", userService);

        for (let user in userService) {
            const [newUser, created] = await models.User.findOrCreate({
                where: { id: user },
                defaults: {
                    id: user,
                },
            });

            let usr = created ? created : newUser;

            for (let serviceId in userService[user]) {
                let [newUserService, oldUserService] =
                    await models.UserService.findOrCreate({
                        where: {
                            user_id: usr.id,
                            service_id: serviceId,
                        },
                        defaults: {
                            user_id: usr.id,
                            service_id: serviceId,
                            number_of_calls: userService[user][serviceId],
                        },
                    });
                if (oldUserService) {
                    await models.User.update(
                        { number_of_calls: userService[user][serviceId] },
                        {
                            where: {
                                user_id: usr.id,
                                service_id: serviceId,
                            },
                        }
                    );
                }
            }
        }
        res.status(200).send("Updated successfully");
    } catch (error) {
        console.error("Error updating data:", error);
        res.status(500).send("Internal Server Error");
    }
};

const updateRecomendations = async (req, res) => {
    try {
        console.log("recomendations");
        const { spawn } = require("child_process");
        const pythonProcess = spawn("python3", [
            "knn.py",
            "./calls.csv",
            req.query.user_id,
        ]);
        const answer = []
        pythonProcess.stdout.on("data", (data) => {
            console.log("data", answer.push(JSON.parse(data.toString())));
        });
        pythonProcess.stdout.on("end", (data) => {
            console.log("end", answer[0].prediction );
            res.send(answer[0])
        });
    } catch (error) {
        console.error("Ошибка при создании рекомендации:", error);
    }
};

module.exports = {
    updateAll,
    updateStatics,
    updateRecomendations
};
