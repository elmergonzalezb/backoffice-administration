'use strict';
var winston = require("winston");

/**
 * Module dependencies.
 */
var path = require('path'),
    errorHandler = require(path.resolve('./modules/core/server/controllers/errors.server.controller')),
    logHandler = require(path.resolve('./modules/mago/server/controllers/logs.server.controller')),
    db = require(path.resolve('./config/lib/sequelize')).models,
    sequelize_t = require(path.resolve('./config/lib/sequelize')),
    DBModel = db.tv_episode,
    refresh = require(path.resolve('./modules/mago/server/controllers/common.controller.js')),
    request = require("request"),
    fs = require('fs');

/**
 * Create
 */
exports.create = function(req, res) {
    if(!req.body.clicks) req.body.clicks = 0;
    if(!req.body.duration) req.body.duration = 0;
    if (!req.body.original_title) req.body.original_title = req.body.title;

    req.body.company_id = req.token.company_id; //save record for this company

    db.tv_season.findOne({
        attributes: ['id'], where: {tv_show_id: req.body.tv_show_id, season_number: req.body.season_number}
    }).then(function(tv_season){
        req.body.tv_season_id = tv_season.id;
        DBModel.create(req.body).then(function(result) {
            if (!result) {
                return res.status(400).send({message: 'fail create data'});
            } else {
                logHandler.add_log(req.token.id, req.ip.replace('::ffff:', ''), 'created', JSON.stringify(req.body));
                return res.jsonp(result);
            }
        }).catch(function(err) {
            winston.error("Error at creating tv episodes, error:",err);
            return res.status(400).send({
                message: errorHandler.getErrorMessage(err)
            });
        });
        return null;
    }).catch(function(err) {
        winston.error("Error at creating tv episodes, error:",err);
        return res.status(400).send({
            message: errorHandler.getErrorMessage(err)
        });
    });
};


/**
 * Show current
 */
exports.read = function(req, res) {
    if(req.tv_episode.company_id === req.token.company_id) res.json(req.tv_episode);
    else return res.status(404).send({message: 'No data with that identifier has been found'});
};

/**
 * Update
 */
exports.update = function(req, res) {

    var updateData = req.tv_episode;
    if(updateData.icon_url != req.body.icon_url) {
        var deletefile = path.resolve('./public'+updateData.icon_url);
    }
    if(updateData.image_url != req.body.image_url) {
        var deleteimage = path.resolve('./public'+updateData.image_url);
    }


    if(req.tv_episode.company_id === req.token.company_id){
        db.tv_season.findOne({
            attributes: ['id'], where: {tv_show_id: req.body.tv_season.tv_sery.tv_show_id, season_number: req.body.season_number}
        }).then(function(tv_season){
            req.body.tv_season_id = tv_season.id;
            updateData.updateAttributes(req.body).then(function(result) {
                if(deletefile) {
                    fs.unlink(deletefile, function (err) {
                        //todo: return some warning
                    });
                }
                logHandler.add_log(req.token.id, req.ip.replace('::ffff:', ''), 'created', JSON.stringify(req.body));
                if(deleteimage) {
                    fs.unlink(deleteimage, function (err) {
                        //todo: return some warning
                    });
                }
                return res.jsonp(result);
            }).catch(function(err) {
                winston.error("Error updating attributes at tv episodes, error:",err);
                return res.status(400).send({
                    message: errorHandler.getErrorMessage(err)
                });
            });
            return null;
        }).catch(function(err) {
            winston.error("Error at finding tv episodes, error:",err);
            return res.status(400).send({
                message: errorHandler.getErrorMessage(err)
            });
        });
    }
    else{
        res.status(404).send({message: 'User not authorized to access these data'});
    }
};


/**
 * Delete
 */
exports.delete = function(req, res) {
    //delete single tv_episode item and it's dependencies
    return sequelize_t.sequelize.transaction(function (t) {
        return db.tv_episode_resume.destroy({where: {tv_episode_id: req.tv_episode.id}}, {transaction: t}).then(function (removed_genres) {
            return db.tv_episode_stream.destroy({where: {tv_episode_id: req.tv_episode.id}}, {transaction: t}).then(function (removed_genres) {
                return db.tv_episode_subtitles.destroy({where: {tv_episode_id: req.tv_episode.id}}, {transaction: t}).then(function (removed_subtitles) {
                    return db.tv_episode.destroy({where: {id: req.tv_episode.id, company_id: req.token.company_id}}, {transaction: t});
                });
            });
        });
    }).then(function (result) {
        return res.json(result);
    }).catch(function (err) {
        winston.error("Error at deleting tv episodes, error:", err);
        return res.status(400).send({message: 'Deleting this tv episode item failed : ' + error});
    });

};

exports.list = function(req, res) {
    var qwhere = {},
        final_where = {},
        query = req.query;

    if(query.q) {
        qwhere.$or = {};
        qwhere.$or.title = {};
        qwhere.$or.title.$like = '%'+query.q+'%';
        qwhere.$or.description = {};
        qwhere.$or.description.$like = '%'+query.q+'%';
        qwhere.$or.director = {};
        qwhere.$or.director.$like = '%'+query.q+'%';
    }
    if(query.title) qwhere.title = {like: '%'+query.title+'%'};

    //filter films added in the following time interval
    if(query.added_before && query.added_after) qwhere.createdAt = {lt: query.added_before, gt: query.added_after};
    else if(query.added_before) qwhere.createdAt = {lt: query.added_before};
    else if(query.added_after) qwhere.createdAt = {gt: query.added_after};
    //filter films updated in the following time interval
    if(query.updated_before && query.updated_after) qwhere.createdAt = {lt: query.updated_before, gt: query.updated_after};
    else if(query.updated_before) qwhere.createdAt = {lt: query.updated_before};
    else if(query.updated_after) qwhere.createdAt = {gt: query.updated_after};
    if(query.expiration_time) qwhere.expiration_time = query.expiration_time;
    if(query.is_available === 'true') qwhere.is_available = true;
    else if(query.is_available === 'false') qwhere.is_available = false;
    if(query.pin_protected === '1') qwhere.pin_protected = true;
    else if(query.pin_protected === '0') qwhere.pin_protected = false;

    if(query.season_number) qwhere.season_number = query.season_number;
    if(query.tv_show_title){
        final_where.include = [{model: db.tv_season, attributes: ['id'], include: [{model: db.tv_series, where: {title: {$like: '%'+query.tv_show_title+'%'}}}]}]
    }

    //start building where
    final_where.where = qwhere;
    if(parseInt(query._end) !== -1){
        if(parseInt(query._start)) final_where.offset = parseInt(query._start);
        if(parseInt(query._end)) final_where.limit = parseInt(query._end)-parseInt(query._start);
    }
    if(query._orderBy) final_where.order = query._orderBy + ' ' + query._orderDir;
    else final_where.order = [['createdAt', 'DESC']];

    final_where.where.company_id = req.token.company_id; //return only records for this company

    //end build final where

    DBModel.findAndCountAll(
        final_where
    ).then(function(results) {
        if (!results) {
            return res.status(404).send({message: 'No data found'});
        } else {
            res.setHeader("X-Total-Count", results.count);
            res.json(results.rows);
        }
    }).catch(function(err) {
        winston.error("Error at findAndCountAll tv episodes, error: ", err);
        res.jsonp(err);
    });

};

/**
 * middleware
 */
exports.dataByID = function(req, res, next, id) {

    if ((id % 1 === 0) === false) { //check if it's integer
        return res.status(404).send({
            message: 'Data is invalid'
        });
    }

    DBModel.find({
        where: {
            id: id
        },
        include: [
            {model: db.tv_episode_subtitles, attributes: ['id', 'title', ['id', 'value'], ['title', 'label']]},{model: db.tv_episode_stream},
            {model: db.tv_season, attributes: [['id', 'tv_season_id']],
                include: [{model: db.tv_series, attributes: [['id', 'tv_show_id']] }]
            }
        ]
    }).then(function(result) {
        if (!result) {
            return res.status(404).send({
                message: 'No data with that identifier has been found'
            });
        } else {
            req.tv_episode = result;
            next();
            return null;
        }
    }).catch(function(err) {
        winston.error("Error at fetching dataById, tv episodes, error: ", err);
        return next(err);
    });

};


/**
 * @api {post} /api/update_film/ update film
 * @apiVersion 0.2.0
 * @apiName UpdateFilm3rdParty
 * @apiGroup Backoffice
 * @apiHeader {String} authorization Token string acquired from login api.
 * @apiDescription Gets movie information from a third party and updates movie
 * @apiSuccessExample Success-Response:
 *     {
 *       "title": "Pan's Labyrinth",
 *       "imdb_id": "tt0457430",
 *       "description": "In the falangist Spain of 1944, ...",
 *       "year": "2006",
 *       "rate": 8,
 *       "duration": "118",
 *       "director": "Guillermo del Toro",
 *       "starring": "Ivana Baquero, Sergi López, Maribel Verdú, Doug Jones"
 *      }
 * @apiErrorExample Error-Response:
 *     {
 *        "message": "error message"
 *     }
 *     Error value set:
 *     An error occurred while updating this movie // Unexpected error occurred when the movie was being updated with teh new data
 *     Could not find this movie // the search params did not return any movie
 *     An error occurred while searching for this movie // Unexpected error occurred while searching for the movie in our database
 *     An error occurred while trying to get this movie's data // Unexpected error occurred while getting the movie's data from the 3rd party
 *     Unable to parse response // The response from the 3rd party service was of invalid format
 *     Unable to find the movie specified by your keywords // The 3rd party service could not find a match using our keywords
 *
 */
exports.update_film = function(req, res) {

    //todo: take care of case when param list is empty.
    var tv_episode_where = {};
    if(req.body.imdb_id) tv_episode_where.imdb_id = req.body.imdb_id;
    else if(req.body.tv_episode_id) tv_episode_where.id = req.body.tv_episode_id;
    else {
        if(req.body.title) tv_episode_where.title = req.body.title;
        if(req.body.year) tv_episode_where.year = req.body.year;
    }

    DBModel.findOne({
        attributes: ['title', 'imdb_id'], where: tv_episode_where
    }).then(function(tv_episode_data){
        if(tv_episode_data){
            var search_params = {"tv_episode_title": tv_episode_data.title};
            if(tv_episode_data.imdb_id !== null) search_params.imdb_id = tv_episode_data.imdb_id; //only use if it is not null
            omdbapi(search_params, function(error, response){
                if(error){
                    return res.status(404).send({
                        message: response
                    });
                }
                else{
                    DBModel.update(
                        response, {where: tv_episode_where}
                    ).then(function(result){
                        res.send(response);
                    }).catch(function(error){
                        winston.error("Error at updating film, tv episodes, error: ", error);
                        return res.status(404).send({
                            message: "An error occurred while updating this movie"
                        });
                    });
                    return null;
                }
            });
        }
        else return res.status(404).send({
            message: "Could not find this movie"
        });
    }).catch(function(error){
        winston.error("Error at finding film, tv episodes, error: ", error);
        return res.status(404).send({
            message: "An error occurred while searching for this movie"
        });
    })



};

function omdbapi(tv_episode_data, callback){

    var api_key = ""; //todo: dynamic value
    var search_params = "";
    if(tv_episode_data.imdb_id) search_params = search_params+'&'+'i='+tv_episode_data.imdb_id;
    else{
        if(tv_episode_data.tv_episode_title) search_params = search_params+'&'+'t='+tv_episode_data.tv_episode_title;
        if(tv_episode_data.year) search_params = search_params+'&'+'&y='+tv_episode_data.year;
    }

    if(search_params !== ""){
        var options = {
            url: 'http://www.omdbapi.com/?apikey='+api_key+search_params,
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        };

        request(options, function (error, response, body) {
            if(error){

                callback(true, "An error occurred while trying to get this movie's data");
            }
            else try {
                var tv_episode_data = {
                    title: JSON.parse(response.body).Title,
                    imdb_id: JSON.parse(response.body).imdbID,
                    description: JSON.parse(response.body).Plot,
                    //icon_url: JSON.parse(response.body).Poster, //todo: check if url is valid. donwload + resize image. if successful, pass new filename as param
                    rate: parseInt(JSON.parse(response.body).imdbRating),
                    duration: JSON.parse(response.body).Runtime.replace(' min', ''),
                    director: JSON.parse(response.body).Director,
                    starring: JSON.parse(response.body).Actors,
                    //pin_protected: (['R', 'X', 'PG-13'].indexOf(JSON.parse(response.body).Rated) !== -1) ? 1 : 0 //todo: will this rate be taken into consideration?
                };
                callback(null, tv_episode_data);
            }
            catch(error){
                callback(true, "Unable to parse response");
            }

        });
    }
    else{
        callback(true, "Unable to find the movie specified by your keywords");
    }

}