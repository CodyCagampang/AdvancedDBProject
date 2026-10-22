## Question 12. Number Of Movies Per Actor
Design Document
_design/schema-b

Index name
numMoviesPerActor

function (doc) {
  if('docs' in doc) {
    doc.docs.forEach(function(movie) {
      if(movie.actor_id && movie.movie_id) {
        emit(movie.actor_id, 1);
      }
    });
  }
}

Reduce
_sum