## Question 13. Versatile Movies Per Actor
Design Document
_design/moviesPerActor

Index name
versatile-actor

function (doc) {
  if('docs' in doc) {
    doc.docs.forEach(function(movies) {
      if(movies.actors && movies.genres) {
        movies.actors.forEach(function(actor) {
          movies.genres.forEach(function(genre) {
          emit([actor,genre], 1);
        });
      });
  }
});
}
}

Reduce
_count