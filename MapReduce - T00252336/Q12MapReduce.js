## Question 12. Number Of Movies Per Actor
Design Document
_design/moviesPerActor

Index name
by-actors

function (doc) {
  if('docs' in doc) {
    doc.docs.forEach(function(movies) {
      if(movies.actors) {
        movies.actors.forEach(function(actor) {
          emit(actor, 1);
      });
    }
  });
}

}

Reduce
_sum